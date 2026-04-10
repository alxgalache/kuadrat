/**
 * Stripe Connect Webhook Controller — Changes #1 and #2
 *
 * Receives V2 EventNotification webhook deliveries from Stripe for connected
 * accounts. This endpoint is configured in the Stripe Dashboard as a
 * "Connected accounts" destination.
 *
 *   - V2 EventNotifications (Change #1):
 *       · v2.core.account[requirements].updated
 *       · v2.core.account[configuration.recipient].capability_status_updated
 *     Parsed with `stripeClient.parseEventNotification()` and dispatched to
 *     `handleAccountChange()` which re-syncs the seller's local status.
 *
 * V1 transfer events (`transfer.created`, `transfer.reversed`, `transfer.failed`)
 * are platform-level "My account" events, so they arrive at the payments webhook
 * (`/api/payments/stripe/webhook`) which delegates to the handler functions
 * exported from this module. See `stripePaymentsController.js`.
 *
 * Idempotency: every event is persisted in `stripe_connect_events` with a
 * UNIQUE constraint on `stripe_event_id`. Duplicate deliveries are silently
 * ignored. Errors during dispatch are persisted as `processing_error` so
 * operators can diagnose issues after the fact.
 *
 * This endpoint is:
 *   - PUBLIC (no auth middleware)
 *   - Reads `req.rawBody` captured by the global express.json() verify callback
 *     (see server.js) — matches the existing stripePaymentsController pattern.
 *   - Distinct from /api/payments/stripe/webhook (which handles payment_intent
 *     and transfer.* events on the platform account).
 */
const stripeClient = require('../services/stripeClient');
const { db } = require('../config/database');
const { createBatch } = require('../utils/transaction');
const config = require('../config/env');
const logger = require('../config/logger');
const stripeConnectService = require('../services/stripeConnectService');
const emailService = require('../services/emailService');
const { bucketColumnFor } = require('./stripeConnectPayoutsController');

/**
 * Load a user by their Stripe connected account ID.
 * @private
 */
async function findUserByAccountId(accountId) {
  const result = await db.execute({
    sql: `SELECT * FROM users WHERE stripe_connect_account_id = ?`,
    args: [accountId],
  });
  return result.rows[0] || null;
}

/**
 * Load a withdrawal by its Stripe transfer id. Returns null if not found.
 * @private
 */
async function findWithdrawalByTransferId(transferId) {
  if (!transferId) return null;
  const result = await db.execute({
    sql: `SELECT * FROM withdrawals WHERE stripe_transfer_id = ?`,
    args: [transferId],
  });
  return result.rows[0] || null;
}

// ─── V2 handlers ───────────────────────────────────────────────────────────

/**
 * Both V2 account events drive the same action: re-sync the account state.
 * We factor them into a single function.
 * @private
 */
async function handleAccountChange(event) {
  const accountId = event.related_object?.id || null;
  if (!accountId) {
    logger.warn({ eventId: event.id, eventType: event.type }, '[stripe-connect-webhook] event has no related account id');
    return;
  }

  const user = await findUserByAccountId(accountId);
  if (!user) {
    logger.warn(
      { eventId: event.id, accountId },
      '[stripe-connect-webhook] account not found in BD (orphan event)'
    );
    return;
  }

  await stripeConnectService.syncAccountStatus({ user });
  logger.info(
    { eventId: event.id, userId: user.id, accountId },
    '[stripe-connect-webhook] account synced from webhook'
  );
}

// ─── V1 transfer handlers (Change #2) ─────────────────────────────────────

/**
 * `transfer.created` is informational for us — the `executePayout` controller
 * already stores the stripe_transfer_id synchronously when the Transfer
 * request returns. We just log it for auditing.
 * @private
 */
async function handleTransferCreated(event) {
  const transfer = event?.data?.object;
  if (!transfer?.id) {
    logger.warn({ eventId: event?.id }, '[stripe-connect-webhook] transfer.created with no transfer id');
    return;
  }

  const withdrawal = await findWithdrawalByTransferId(transfer.id);
  if (!withdrawal) {
    logger.warn(
      { eventId: event.id, transferId: transfer.id },
      '[stripe-connect-webhook] transfer.created: no matching withdrawal'
    );
    return;
  }

  logger.info(
    {
      eventId: event.id,
      transferId: transfer.id,
      withdrawalId: Number(withdrawal.id),
      status: withdrawal.status,
    },
    '[stripe-connect-webhook] transfer.created acknowledged'
  );
}

/**
 * `transfer.reversed` — the platform admin reversed the transfer from the
 * Stripe Dashboard. We flip the local row to `reversed`, store the reversal
 * amount, and credit the corresponding wallet bucket back to the seller.
 * @private
 */
async function handleTransferReversed(event) {
  const transfer = event?.data?.object;
  if (!transfer?.id) {
    logger.warn({ eventId: event?.id }, '[stripe-connect-webhook] transfer.reversed with no transfer id');
    return;
  }

  const withdrawal = await findWithdrawalByTransferId(transfer.id);
  if (!withdrawal) {
    logger.warn(
      { eventId: event.id, transferId: transfer.id },
      '[stripe-connect-webhook] transfer.reversed: no matching withdrawal'
    );
    return;
  }

  // Idempotent: if already reversed, skip (probably a duplicate delivery or
  // the admin already called the manual /mark-reversed endpoint).
  if (withdrawal.status === 'reversed') {
    logger.info(
      { eventId: event.id, withdrawalId: Number(withdrawal.id) },
      '[stripe-connect-webhook] transfer.reversed: already reversed, skipping'
    );
    return;
  }

  // `transfer.amount_reversed` is in minor units (cents). For a full reversal
  // it equals transfer.amount. We credit that amount back to the user's bucket.
  const reversalAmountCents = Number(transfer.amount_reversed || 0);
  const reversalAmountEur = Math.round(reversalAmountCents) / 100;

  if (reversalAmountEur <= 0) {
    logger.warn(
      { eventId: event.id, transferId: transfer.id, reversalAmountCents },
      '[stripe-connect-webhook] transfer.reversed with zero amount — ignoring'
    );
    return;
  }

  const bucketColumn = bucketColumnFor(withdrawal.vat_regime);

  const batch = createBatch();
  batch.add(
    `UPDATE withdrawals
     SET status = 'reversed',
         reversed_at = CURRENT_TIMESTAMP,
         reversal_amount = ?,
         reversal_reason = ?
     WHERE id = ?`,
    [reversalAmountEur, 'Revertido desde el panel de Stripe', Number(withdrawal.id)]
  );
  batch.add(
    `UPDATE users SET ${bucketColumn} = ${bucketColumn} + ? WHERE id = ?`,
    [reversalAmountEur, Number(withdrawal.user_id)]
  );
  await batch.execute();

  logger.info(
    {
      eventId: event.id,
      withdrawalId: Number(withdrawal.id),
      transferId: transfer.id,
      reversalAmountEur,
      vat_regime: withdrawal.vat_regime,
    },
    '[stripe-connect-webhook] transfer reversed — bucket credited back'
  );

  // Notify the admin (non-blocking; the email function is added in Fase 11).
  try {
    await emailService.sendAdminPayoutReversedEmail({
      withdrawal,
      reversalAmount: reversalAmountEur,
    });
  } catch (err) {
    logger.error(
      { err, withdrawalId: Number(withdrawal.id) },
      '[stripe-connect-webhook] failed to send reversed email'
    );
  }
}

/**
 * `transfer.failed` — rare, but possible if the destination account becomes
 * invalid after the transfer was created. We mark the withdrawal as failed,
 * restore the full amount to the bucket, and notify the admin.
 * @private
 */
async function handleTransferFailed(event) {
  const transfer = event?.data?.object;
  if (!transfer?.id) {
    logger.warn({ eventId: event?.id }, '[stripe-connect-webhook] transfer.failed with no transfer id');
    return;
  }

  const withdrawal = await findWithdrawalByTransferId(transfer.id);
  if (!withdrawal) {
    logger.warn(
      { eventId: event.id, transferId: transfer.id },
      '[stripe-connect-webhook] transfer.failed: no matching withdrawal'
    );
    return;
  }

  // Idempotent: if already failed, skip.
  if (withdrawal.status === 'failed') {
    logger.info(
      { eventId: event.id, withdrawalId: Number(withdrawal.id) },
      '[stripe-connect-webhook] transfer.failed: already failed, skipping'
    );
    return;
  }

  // If we previously marked the withdrawal `reversed`, don't double-credit
  // the bucket — just log and move on.
  if (withdrawal.status === 'reversed') {
    logger.warn(
      { eventId: event.id, withdrawalId: Number(withdrawal.id) },
      '[stripe-connect-webhook] transfer.failed on already-reversed withdrawal — not re-crediting'
    );
    return;
  }

  const amountEur = Number(withdrawal.amount) || 0;
  const failureReason = String(
    transfer.failure_message || transfer.failure_code || 'Transfer failed (sin detalle)'
  ).slice(0, 500);

  const bucketColumn = bucketColumnFor(withdrawal.vat_regime);

  const batch = createBatch();
  batch.add(
    `UPDATE withdrawals
     SET status = 'failed', failure_reason = ?
     WHERE id = ?`,
    [failureReason, Number(withdrawal.id)]
  );
  batch.add(
    `UPDATE users SET ${bucketColumn} = ${bucketColumn} + ? WHERE id = ?`,
    [amountEur, Number(withdrawal.user_id)]
  );
  await batch.execute();

  logger.info(
    {
      eventId: event.id,
      withdrawalId: Number(withdrawal.id),
      transferId: transfer.id,
      amountEur,
      failureReason,
    },
    '[stripe-connect-webhook] transfer failed — bucket restored'
  );

  // Notify the admin (non-blocking; the email function is added in Fase 11).
  try {
    await emailService.sendAdminPayoutFailedEmail({
      withdrawal,
      failureReason,
    });
  } catch (err) {
    logger.error(
      { err, withdrawalId: Number(withdrawal.id) },
      '[stripe-connect-webhook] failed to send failed email'
    );
  }
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

/**
 * Dispatcher — maps V2 event type → handler.
 * Returns `true` if the event was handled, `false` otherwise.
 * @private
 */
async function dispatchHandler(event) {
  switch (event.type) {
    case 'v2.core.account[requirements].updated':
    case 'v2.core.account[configuration.recipient].capability_status_updated':
      await handleAccountChange(event);
      return true;
    default:
      logger.warn(
        { eventId: event.id, eventType: event.type },
        '[stripe-connect-webhook] unknown event type'
      );
      return false;
  }
}

/**
 * POST /api/stripe/connect/webhook
 *
 * Parses the incoming V2 event, persists it with idempotency guard,
 * dispatches the handler, and marks the row as processed on success.
 */
async function handleConnectWebhook(req, res) {
  if (!config.stripe.connect.webhookSecret) {
    logger.warn('[stripe-connect-webhook] STRIPE_CONNECT_WEBHOOK_SECRET is not configured; ignoring event');
    return res.status(200).json({ received: true, ignored: true });
  }

  const sig = req.headers['stripe-signature'];
  const rawBody = req.rawBody || '';

  let event;
  try {
    event = stripeClient.parseEventNotification(
      rawBody,
      sig,
      config.stripe.connect.webhookSecret
    );
  } catch (err) {
    logger.warn({ err }, '[stripe-connect-webhook] invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const accountId = event.related_object?.id || null;

  // Persist for idempotency + audit.
  let inserted;
  try {
    inserted = await db.execute({
      sql: `INSERT OR IGNORE INTO stripe_connect_events
            (stripe_event_id, stripe_event_type, account_id, payload_json)
            VALUES (?, ?, ?, ?)`,
      args: [event.id, event.type, accountId, JSON.stringify(event)],
    });
  } catch (err) {
    logger.error({ err, eventId: event.id }, '[stripe-connect-webhook] failed to persist event');
    return res.status(500).json({ error: 'DB persistence failed' });
  }

  if (inserted.rowsAffected === 0) {
    logger.info({ eventId: event.id }, '[stripe-connect-webhook] duplicate event ignored');
    return res.status(200).json({ received: true, duplicate: true });
  }

  // Dispatch.
  try {
    const handled = await dispatchHandler(event);
    if (handled) {
      await db.execute({
        sql: `UPDATE stripe_connect_events SET processed_at = CURRENT_TIMESTAMP WHERE stripe_event_id = ?`,
        args: [event.id],
      });
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error(
      { err, eventId: event.id, eventType: event.type },
      '[stripe-connect-webhook] handler threw'
    );
    try {
      await db.execute({
        sql: `UPDATE stripe_connect_events SET processing_error = ? WHERE stripe_event_id = ?`,
        args: [String(err?.stack || err?.message || err), event.id],
      });
    } catch (updateErr) {
      logger.error({ err: updateErr }, '[stripe-connect-webhook] failed to persist processing_error');
    }
    return res.status(500).json({ error: 'Handler failed' });
  }
}

module.exports = {
  handleConnectWebhook,
  // Exported for stripePaymentsController (transfer.* delegation) and unit testing.
  handleTransferCreated,
  handleTransferReversed,
  handleTransferFailed,
  // Exported for unit testing.
  handleAccountChange,
  dispatchHandler,
};
