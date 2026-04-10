/**
 * Stripe Connect Service — Change #1: stripe-connect-accounts
 *
 * Wraps Stripe V2 Core API for connected account lifecycle:
 *   - createConnectedAccount  → v2.core.accounts.create (recipient-only, identity.country='es', dashboard='express')
 *   - createOnboardingLink    → v2.core.accountLinks.create (hosted flow)
 *   - retrieveAccount         → v2.core.accounts.retrieve
 *   - mapAccountToLocalStatus → pure function mapping Stripe state → local enum
 *   - syncAccountStatus       → retrieve + map + UPDATE users
 *
 * Never uses V1 (type: 'express'|'standard'|'custom') — those are legacy.
 * See docs/stripe_connect/master_plan.md and openspec/changes/stripe-connect-accounts/design.md.
 */
const stripeClient = require('./stripeClient');
const { db } = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Guard: ensure Stripe Connect is enabled in this environment.
 * Throws 503 if disabled, so callers get a clear, uniform error.
 * @private
 */
function assertConnectEnabled() {
  if (!config.stripe.connect.enabled) {
    throw new ApiError(503, 'Stripe Connect is not enabled in this environment');
  }
}

/**
 * Wrap a Stripe SDK call, translating Stripe errors into ApiError(502).
 * @private
 */
async function callStripe(fn, context) {
  try {
    return await fn();
  } catch (err) {
    logger.error(
      { err, stripeCode: err?.code, stripeType: err?.type, context },
      '[stripe-connect] Stripe API error'
    );
    const apiErr = new ApiError(502, `Stripe API error: ${err.message || 'unknown'}`);
    apiErr.cause = err?.code || err?.type || 'stripe_error';
    throw apiErr;
  }
}

/**
 * Create a new connected account in Stripe using the V2 API (recipient-only).
 *
 * @param {Object} params
 * @param {Object} params.user - The seller row from `users` (must have id, email, full_name).
 * @returns {Promise<Object>} Stripe account object with `id` (acct_*).
 */
async function createConnectedAccount({ user }) {
  assertConnectEnabled();

  const account = await callStripe(
    () => stripeClient.v2.core.accounts.create(
      {
        display_name: user.full_name || user.email,
        contact_email: user.email,
        identity: { country: 'es' },
        dashboard: 'express',
        defaults: {
          responsibilities: {
            fees_collector: 'application',
            losses_collector: 'application',
          },
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { requested: true },
              },
            },
          },
        },
      },
      {
        idempotencyKey: `account_create_user_${user.id}_v1`,
      }
    ),
    { op: 'createConnectedAccount', userId: user.id }
  );

  logger.info(
    { userId: user.id, accountId: account.id },
    '[stripe-connect] connected account created'
  );
  return account;
}

/**
 * Create a hosted onboarding link for a connected account.
 *
 * @param {Object} params
 * @param {string} params.stripeAccountId - The acct_* ID.
 * @returns {Promise<{url: string, expires_at: number}>}
 */
async function createOnboardingLink({ stripeAccountId }) {
  assertConnectEnabled();

  const link = await callStripe(
    () => stripeClient.v2.core.accountLinks.create({
      account: stripeAccountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: `${config.stripe.connect.refreshUrl}?account=${stripeAccountId}`,
          return_url: `${config.stripe.connect.returnUrl}?account=${stripeAccountId}`,
        },
      },
    }),
    { op: 'createOnboardingLink', stripeAccountId }
  );

  return { url: link.url, expires_at: link.expires_at };
}

/**
 * Retrieve a connected account from Stripe (full state: recipient config + requirements).
 *
 * @param {string} stripeAccountId
 * @returns {Promise<Object>} Full account object.
 */
async function retrieveAccount(stripeAccountId) {
  assertConnectEnabled();

  return callStripe(
    () => stripeClient.v2.core.accounts.retrieve(stripeAccountId, {
      include: ['configuration.recipient', 'requirements'],
    }),
    { op: 'retrieveAccount', stripeAccountId }
  );
}

/**
 * Pure function: map a Stripe account object to the local status descriptor.
 * No DB, no IO — safe to unit-test and call multiple times.
 *
 * Priority order:
 *   1. explicit rejection      → 'rejected'
 *   2. transfers capability active → 'active'
 *   3. past_due/errored requirements → 'restricted'
 *   4. currently_due / default → 'pending'
 *
 * @param {Object} account - Stripe account object.
 * @returns {{status: string, transfers_capability_active: boolean, requirements_due: string[]}}
 */
function mapAccountToLocalStatus(account) {
  const transfersStatus =
    account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status || null;
  const transfersCapabilityActive = transfersStatus === 'active';

  const requirementsSummary = account?.requirements?.summary?.minimum_deadline || {};
  const requirementsDue = Array.isArray(requirementsSummary.currently_due)
    ? [...requirementsSummary.currently_due]
    : [];

  // Rejection detection — Stripe uses requirements.disabled_reason for rejected accounts.
  const disabledReason = account?.requirements?.disabled_reason || '';
  if (typeof disabledReason === 'string' && disabledReason.startsWith('rejected')) {
    return {
      status: 'rejected',
      transfers_capability_active: transfersCapabilityActive,
      requirements_due: requirementsDue,
    };
  }

  if (transfersCapabilityActive) {
    return {
      status: 'active',
      transfers_capability_active: true,
      requirements_due: requirementsDue,
    };
  }

  const deadlineStatus = requirementsSummary.status || null;
  if (deadlineStatus === 'past_due' || deadlineStatus === 'errored') {
    return {
      status: 'restricted',
      transfers_capability_active: false,
      requirements_due: requirementsDue,
    };
  }

  // Default: pending (includes currently_due and any unknown/initial state).
  return {
    status: 'pending',
    transfers_capability_active: false,
    requirements_due: requirementsDue,
  };
}

/**
 * Sync a user's local Stripe Connect state from the live Stripe account.
 *
 * No-op if the user has no connected account. Otherwise: retrieve → map → UPDATE users.
 *
 * @param {Object} params
 * @param {Object} params.user - The seller row from `users`.
 * @param {Object} [params.account] - Optional pre-fetched account object; if absent, fetched here.
 * @returns {Promise<Object>} { status, transfers_capability_active, requirements_due, account }
 */
async function syncAccountStatus({ user, account = null }) {
  if (!user?.stripe_connect_account_id) {
    return { status: 'not_started' };
  }

  assertConnectEnabled();

  const freshAccount = account || (await retrieveAccount(user.stripe_connect_account_id));
  const mapped = mapAccountToLocalStatus(freshAccount);

  await db.execute({
    sql: `UPDATE users
          SET stripe_connect_status = ?,
              stripe_transfers_capability_active = ?,
              stripe_connect_requirements_due = ?,
              stripe_connect_last_synced_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
    args: [
      mapped.status,
      mapped.transfers_capability_active ? 1 : 0,
      JSON.stringify(mapped.requirements_due),
      user.id,
    ],
  });

  if (user.stripe_connect_status !== mapped.status) {
    logger.info(
      {
        userId: user.id,
        oldStatus: user.stripe_connect_status,
        newStatus: mapped.status,
      },
      '[stripe-connect] account status synced'
    );
  }

  return { ...mapped, account: freshAccount };
}

/**
 * Create a single-use login link for a connected account's Express Dashboard.
 * Uses V1 API (login_links is not available in V2).
 *
 * @param {string} stripeAccountId - The acct_* ID.
 * @returns {Promise<{url: string}>}
 */
async function createLoginLink(stripeAccountId) {
  assertConnectEnabled();

  const loginLink = await callStripe(
    () => stripeClient.accounts.createLoginLink(stripeAccountId),
    { op: 'createLoginLink', stripeAccountId }
  );

  return { url: loginLink.url };
}

// ---------------------------------------------------------------------------
// Change #2: stripe-connect-manual-payouts — Transfers V1
// ---------------------------------------------------------------------------
//
// Stripe Connect V2 covers account lifecycle but `transfers.create` only
// exists in V1. Mixing is officially supported: the account is created via
// v2.core.accounts.create (Change #1) and the transfer is executed via the
// V1 endpoint here. See docs/stripe_connect/master_plan.md §6.6 and
// docs/stripe_connect/transfers.md.
//
// Design:
//   - Amount is passed in euros (REAL) to match the rest of the codebase; we
//     convert to minor units (cents) inside the service using Math.round.
//   - `source_transaction` is intentionally omitted → financed from platform
//     balance (separate charges and transfers model).
//   - Idempotency key is derived from the local withdrawal id:
//     `transfer_withdrawal_<id>_v1`. Stable across retries.

/**
 * Convert an amount in euros (float) to Stripe minor units (integer cents).
 *
 * @private
 * @param {number} amountEur
 * @returns {number}
 */
function eurosToCents(amountEur) {
  return Math.round((Number(amountEur) || 0) * 100);
}

/**
 * Create a Stripe Connect Transfer (V1) that moves funds from the platform
 * balance to a connected account.
 *
 * @param {Object} params
 * @param {Object} params.withdrawal             - Local withdrawal row; MUST contain
 *                                                  `id`, `user_id`, `amount`, `vat_regime`.
 * @param {string} params.connectedAccountId     - The seller's acct_* id.
 * @param {number} params.itemsCount             - Number of items covered by this payout.
 * @returns {Promise<Object>} The Stripe Transfer object.
 */
async function createTransfer({ withdrawal, connectedAccountId, itemsCount }) {
  assertConnectEnabled();

  if (!withdrawal?.id) {
    throw new ApiError(500, 'createTransfer: withdrawal.id is required');
  }
  if (!connectedAccountId) {
    throw new ApiError(500, 'createTransfer: connectedAccountId is required');
  }

  const amountCents = eurosToCents(withdrawal.amount);
  if (amountCents <= 0) {
    throw new ApiError(400, 'No se puede ejecutar un payout con importe cero o negativo');
  }

  const description = `140d Galeria de Arte - pago ${
    withdrawal.vat_regime === 'art_rebu' ? 'obras' : 'productos/servicios'
  } (W#${withdrawal.id})`;

  const transfer = await callStripe(
    () => stripeClient.transfers.create(
      {
        amount: amountCents,
        currency: 'eur',
        destination: connectedAccountId,
        description,
        transfer_group: `WITHDRAWAL_${withdrawal.id}`,
        metadata: {
          withdrawal_id: String(withdrawal.id),
          user_id: String(withdrawal.user_id),
          vat_regime: String(withdrawal.vat_regime || ''),
          items_count: String(itemsCount || 0),
          platform: 'kuadrat',
        },
      },
      {
        idempotencyKey: `transfer_withdrawal_${withdrawal.id}_v1`,
      }
    ),
    { op: 'createTransfer', withdrawalId: withdrawal.id, connectedAccountId }
  );

  logger.info(
    {
      withdrawalId: withdrawal.id,
      transferId: transfer.id,
      amountCents,
      destination: connectedAccountId,
      vat_regime: withdrawal.vat_regime,
    },
    '[stripe-connect] transfer created'
  );

  return transfer;
}

/**
 * Retrieve a Stripe Transfer by id. Used by webhook handlers to refresh
 * status when Stripe sends us an event we want to double-check.
 *
 * @param {string} transferId
 * @returns {Promise<Object>} Stripe Transfer object.
 */
async function retrieveTransfer(transferId) {
  assertConnectEnabled();

  return callStripe(
    () => stripeClient.transfers.retrieve(transferId),
    { op: 'retrieveTransfer', transferId }
  );
}

/**
 * List reversals for a transfer. Used when syncing a reversal from the
 * Stripe Dashboard back into our local `withdrawals` row.
 *
 * @param {string} transferId
 * @returns {Promise<{data: Object[]}>}
 */
async function listTransferReversals(transferId) {
  assertConnectEnabled();

  return callStripe(
    () => stripeClient.transfers.listReversals(transferId),
    { op: 'listTransferReversals', transferId }
  );
}

module.exports = {
  createConnectedAccount,
  createOnboardingLink,
  createLoginLink,
  retrieveAccount,
  mapAccountToLocalStatus,
  syncAccountStatus,
  // Change #2 — Transfers V1
  createTransfer,
  retrieveTransfer,
  listTransferReversals,
};
