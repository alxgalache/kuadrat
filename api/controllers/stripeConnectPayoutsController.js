/**
 * Stripe Connect Payouts Controller — Change #2: stripe-connect-manual-payouts
 *
 * Implements the admin payouts panel:
 *
 *   - GET  /api/admin/payouts
 *   - GET  /api/admin/payouts/:sellerId
 *   - POST /api/admin/payouts/:sellerId/preview
 *   - POST /api/admin/payouts/:sellerId/execute
 *   - POST /api/admin/payouts/withdrawals/:withdrawalId/mark-reversed
 *
 * The execute flow follows design §4 step by step:
 *
 *   1. Local transaction inserts the withdrawals row (status='processing'),
 *      inserts the withdrawal_items children, and debits the matching bucket
 *      on users.
 *   2. stripeConnectService.createTransfer is called with a deterministic
 *      idempotency key.
 *   3a. On success: the row is flipped to 'completed' with stripe_transfer_id
 *       and executed_at, and the seller receives an email.
 *   3b. On failure: the bucket decrement is reverted, the children rows are
 *       deleted, the parent row is flipped to 'failed' with failure_reason,
 *       and a 5xx is returned to the admin.
 *
 * Confirmation tokens are stored in an in-memory Map with a 5-minute TTL and
 * are single-use — they are deleted as soon as `execute` consumes them. This
 * is sufficient for single-instance deployments (see design §1 decision #6).
 */
const crypto = require('crypto');
const { db } = require('../config/database');
const { createBatch } = require('../utils/transaction');
const { ApiError } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');
const stripeConnectService = require('../services/stripeConnectService');
const emailService = require('../services/emailService');
const logger = require('../config/logger');
const { computeRebuVat, computeStandardVat } = require('../utils/vatCalculator');

// ─── Confirmation token store ──────────────────────────────────────────────

const CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Map<token, { sellerId, vatRegime, itemRefs, createdAt }>
 * @private
 */
const confirmationTokens = new Map();

function pruneExpiredTokens() {
  const now = Date.now();
  for (const [token, entry] of confirmationTokens.entries()) {
    if (now - entry.createdAt > CONFIRMATION_TTL_MS) {
      confirmationTokens.delete(token);
    }
  }
}

function issueConfirmationToken(payload) {
  pruneExpiredTokens();
  const token = crypto.randomUUID();
  confirmationTokens.set(token, { ...payload, createdAt: Date.now() });
  return token;
}

function consumeConfirmationToken(token) {
  pruneExpiredTokens();
  const entry = confirmationTokens.get(token);
  if (!entry) return null;
  confirmationTokens.delete(token); // single-use
  return entry;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function bucketColumnFor(vatRegime) {
  if (vatRegime === 'art_rebu') return 'available_withdrawal_art_rebu';
  if (vatRegime === 'standard_vat') return 'available_withdrawal_standard_vat';
  throw new ApiError(400, 'vat_regime inválido');
}

function itemTypeFor(vatRegime) {
  // For now the two supported item kinds are art_order_items (REBU) and
  // other_order_items (standard_vat). Event attendees are included in the
  // schema for Change #4 but this controller does not credit them yet.
  if (vatRegime === 'art_rebu') return 'art_order_item';
  if (vatRegime === 'standard_vat') return 'other_order_item';
  throw new ApiError(400, 'vat_regime inválido');
}

function itemTableFor(vatRegime) {
  if (vatRegime === 'art_rebu') return 'art_order_items';
  if (vatRegime === 'standard_vat') return 'other_order_items';
  throw new ApiError(400, 'vat_regime inválido');
}

function productJoinFor(vatRegime) {
  if (vatRegime === 'art_rebu') {
    return { productTable: 'art', idColumn: 'art_id' };
  }
  return { productTable: 'others', idColumn: 'other_id' };
}

function vatComputeFor(vatRegime) {
  return vatRegime === 'art_rebu' ? computeRebuVat : computeStandardVat;
}

async function loadSellerOrThrow(sellerId) {
  const result = await db.execute({
    sql: `SELECT * FROM users WHERE id = ? AND role = 'seller'`,
    args: [sellerId],
  });
  if (result.rows.length === 0) {
    throw new ApiError(404, 'Vendedor no encontrado');
  }
  return result.rows[0];
}

/**
 * Find which of the given item references (keyed by {item_type, item_id}) are
 * already part of an active withdrawal (status not in failed/cancelled).
 * Returns the subset that conflict, empty if none.
 *
 * @param {Array<{item_type: string, item_id: number}>} itemRefs
 * @returns {Promise<Array<{item_type: string, item_id: number, withdrawal_id: number}>>}
 */
async function findItemsAlreadyInActiveWithdrawal(itemRefs) {
  if (!itemRefs || itemRefs.length === 0) return [];

  // One-shot query: pull any withdrawal_items whose parent withdrawal is
  // still "active" (i.e. not failed/cancelled) for any of the given item refs.
  const placeholders = itemRefs.map(() => '(?, ?)').join(', ');
  const flat = [];
  for (const ref of itemRefs) {
    flat.push(ref.item_type, ref.item_id);
  }

  const sql = `
    SELECT wi.item_type, wi.item_id, wi.withdrawal_id
    FROM withdrawal_items wi
    JOIN withdrawals w ON wi.withdrawal_id = w.id
    WHERE (wi.item_type, wi.item_id) IN (${placeholders})
      AND w.status NOT IN ('failed', 'cancelled')
  `;

  const result = await db.execute({ sql, args: flat });
  return result.rows.map((r) => ({
    item_type: r.item_type,
    item_id: Number(r.item_id),
    withdrawal_id: Number(r.withdrawal_id),
  }));
}

/**
 * Fetch the list of "pending" items for a seller in a given VAT regime.
 * Pending = confirmed (credited to the wallet) AND not yet in any active
 * withdrawal. If `restrictIds` is provided, only those are considered.
 *
 * @param {number} sellerId
 * @param {'art_rebu'|'standard_vat'} vatRegime
 * @param {number[]} [restrictIds]
 * @returns {Promise<Array>} rows with {id, order_id, price_at_purchase, commission_amount}
 */
async function loadPendingItems(sellerId, vatRegime, restrictIds) {
  const table = itemTableFor(vatRegime);
  const { productTable, idColumn } = productJoinFor(vatRegime);
  const itemType = itemTypeFor(vatRegime);

  const args = [sellerId];
  let whereIds = '';
  if (Array.isArray(restrictIds) && restrictIds.length > 0) {
    whereIds = `AND i.id IN (${restrictIds.map(() => '?').join(', ')}) `;
    args.push(...restrictIds);
  }

  // Confirmed items only. Exclude items that are already in an active
  // withdrawal (status not in failed/cancelled).
  const sql = `
    SELECT i.id, i.order_id, i.price_at_purchase, i.commission_amount
    FROM ${table} i
    JOIN ${productTable} p ON i.${idColumn} = p.id
    WHERE p.seller_id = ?
      AND i.status = 'confirmed'
      ${whereIds}
      AND NOT EXISTS (
        SELECT 1
        FROM withdrawal_items wi
        JOIN withdrawals w ON wi.withdrawal_id = w.id
        WHERE wi.item_type = '${itemType}'
          AND wi.item_id = i.id
          AND w.status NOT IN ('failed', 'cancelled')
      )
    ORDER BY i.id ASC
  `;

  const result = await db.execute({ sql, args });
  return result.rows;
}

/**
 * Compute a payout summary from a list of pending items + VAT regime.
 *
 * @param {Array} items
 * @param {'art_rebu'|'standard_vat'} vatRegime
 * @returns {{ total: number, taxable_base: number, vat_amount: number, item_count: number, items: Array }}
 */
function buildPayoutSummary(items, vatRegime) {
  const compute = vatComputeFor(vatRegime);
  const itemType = itemTypeFor(vatRegime);

  let total = 0;
  let taxableBase = 0;
  let vatAmount = 0;
  const lines = [];

  for (const item of items) {
    const split = compute({
      price: Number(item.price_at_purchase) || 0,
      commission: Number(item.commission_amount) || 0,
    });
    total += split.sellerEarning;
    taxableBase += split.taxableBase;
    vatAmount += split.vatAmount;
    lines.push({
      item_type: itemType,
      item_id: Number(item.id),
      order_id: Number(item.order_id),
      seller_earning: split.sellerEarning,
      taxable_base: split.taxableBase,
      vat_rate: split.vatRate,
      vat_amount: split.vatAmount,
      vat_regime: vatRegime,
    });
  }

  return {
    total: Math.round(total * 100) / 100,
    taxable_base: Math.round(taxableBase * 100) / 100,
    vat_amount: Math.round(vatAmount * 100) / 100,
    item_count: lines.length,
    items: lines,
  };
}

// ─── HTTP handlers ─────────────────────────────────────────────────────────

/**
 * GET /api/admin/payouts
 * List all sellers with positive balance in at least one bucket.
 */
async function listSellersWithBalance(req, res, next) {
  try {
    const result = await db.execute({
      sql: `
        SELECT id, full_name, email,
               available_withdrawal_art_rebu,
               available_withdrawal_standard_vat,
               stripe_connect_account_id,
               stripe_connect_status,
               stripe_transfers_capability_active
        FROM users
        WHERE role = 'seller'
          AND (available_withdrawal_art_rebu > 0 OR available_withdrawal_standard_vat > 0)
        ORDER BY (available_withdrawal_art_rebu + available_withdrawal_standard_vat) DESC
      `,
      args: [],
    });

    const sellers = result.rows.map((row) => ({
      id: Number(row.id),
      full_name: row.full_name,
      email: row.email,
      balance_art_rebu: Number(row.available_withdrawal_art_rebu) || 0,
      balance_standard_vat: Number(row.available_withdrawal_standard_vat) || 0,
      total_balance:
        (Number(row.available_withdrawal_art_rebu) || 0) +
        (Number(row.available_withdrawal_standard_vat) || 0),
      stripe_connect_account_id: row.stripe_connect_account_id || null,
      stripe_connect_status: row.stripe_connect_status || 'not_started',
      stripe_transfers_capability_active: Boolean(row.stripe_transfers_capability_active),
    }));

    sendSuccess(res, { sellers });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/payouts/:sellerId
 * Full payout detail for a seller: both buckets, pending items, history.
 */
async function getSellerPayoutDetail(req, res, next) {
  try {
    const sellerId = parseInt(req.params.sellerId, 10);
    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      throw new ApiError(400, 'sellerId inválido');
    }

    const seller = await loadSellerOrThrow(sellerId);

    const pendingArt = await loadPendingItems(sellerId, 'art_rebu');
    const pendingOthers = await loadPendingItems(sellerId, 'standard_vat');

    const artSummary = buildPayoutSummary(pendingArt, 'art_rebu');
    const standardSummary = buildPayoutSummary(pendingOthers, 'standard_vat');

    const historyResult = await db.execute({
      sql: `
        SELECT id, amount, vat_regime, status, taxable_base_total, vat_amount_total,
               stripe_transfer_id, stripe_transfer_group, executed_at, executed_by_admin_id,
               failure_reason, reversed_at, reversal_amount, reversal_reason, created_at
        FROM withdrawals
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `,
      args: [sellerId],
    });

    sendSuccess(res, {
      seller: {
        id: Number(seller.id),
        full_name: seller.full_name,
        email: seller.email,
        stripe_connect_account_id: seller.stripe_connect_account_id || null,
        stripe_connect_status: seller.stripe_connect_status || 'not_started',
        stripe_transfers_capability_active: Boolean(seller.stripe_transfers_capability_active),
      },
      balances: {
        art_rebu: Number(seller.available_withdrawal_art_rebu) || 0,
        standard_vat: Number(seller.available_withdrawal_standard_vat) || 0,
      },
      pending: {
        art_rebu: artSummary,
        standard_vat: standardSummary,
      },
      history: historyResult.rows.map((w) => ({
        id: Number(w.id),
        amount: Number(w.amount) || 0,
        vat_regime: w.vat_regime,
        status: w.status,
        taxable_base_total: w.taxable_base_total !== null ? Number(w.taxable_base_total) : null,
        vat_amount_total: w.vat_amount_total !== null ? Number(w.vat_amount_total) : null,
        stripe_transfer_id: w.stripe_transfer_id,
        stripe_transfer_group: w.stripe_transfer_group,
        executed_at: w.executed_at,
        executed_by_admin_id: w.executed_by_admin_id !== null ? Number(w.executed_by_admin_id) : null,
        failure_reason: w.failure_reason,
        reversed_at: w.reversed_at,
        reversal_amount: w.reversal_amount !== null ? Number(w.reversal_amount) : null,
        reversal_reason: w.reversal_reason,
        created_at: w.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/payouts/:sellerId/preview
 * Compute a non-persistent preview summary and return a single-use token.
 */
async function previewPayout(req, res, next) {
  try {
    const sellerId = parseInt(req.params.sellerId, 10);
    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      throw new ApiError(400, 'sellerId inválido');
    }

    const { vat_regime: vatRegime, item_ids: itemIds } = req.body;

    const seller = await loadSellerOrThrow(sellerId);

    // Fetch pending items for that regime.
    const pending = await loadPendingItems(sellerId, vatRegime, itemIds);
    if (pending.length === 0) {
      throw new ApiError(400, 'No hay items pendientes de pago para este régimen');
    }

    const summary = buildPayoutSummary(pending, vatRegime);

    if (summary.total <= 0) {
      throw new ApiError(400, 'El importe a pagar es cero o negativo');
    }

    // Also sanity-check the bucket matches the sum of items (should be >= summary.total).
    const bucketColumn = bucketColumnFor(vatRegime);
    const currentBucketBalance = Number(seller[bucketColumn]) || 0;
    if (currentBucketBalance + 0.005 < summary.total) {
      // Tiny fuzz factor for float rounding.
      logger.warn(
        { sellerId, vatRegime, currentBucketBalance, total: summary.total },
        'Preview: bucket balance is smaller than the sum of pending items'
      );
    }

    const token = issueConfirmationToken({
      sellerId,
      vatRegime,
      itemRefs: summary.items.map((i) => ({ item_type: i.item_type, item_id: i.item_id })),
    });

    sendSuccess(res, {
      token,
      idempotency_key_preview: `transfer_withdrawal_<new>_v1`,
      summary,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/payouts/:sellerId/execute
 * End-to-end payout execution: local transaction → Stripe call → finalize.
 */
async function executePayout(req, res, next) {
  try {
    const sellerId = parseInt(req.params.sellerId, 10);
    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      throw new ApiError(400, 'sellerId inválido');
    }

    const {
      vat_regime: vatRegime,
      item_ids: itemIds,
      confirmation_token: confirmationToken,
    } = req.body;

    // Validate and consume the confirmation token.
    const tokenEntry = consumeConfirmationToken(confirmationToken);
    if (!tokenEntry) {
      throw new ApiError(409, 'Token de confirmación expirado o ya usado. Vuelve a previsualizar.');
    }
    if (tokenEntry.sellerId !== sellerId || tokenEntry.vatRegime !== vatRegime) {
      throw new ApiError(409, 'El token de confirmación no corresponde a esta solicitud');
    }

    const seller = await loadSellerOrThrow(sellerId);

    // Precondition: the seller must have an active connected account with
    // the transfers capability enabled. Otherwise Stripe would reject.
    if (
      seller.stripe_connect_status !== 'active' ||
      !seller.stripe_transfers_capability_active ||
      !seller.stripe_connect_account_id
    ) {
      throw new ApiError(
        422,
        'La cuenta conectada del artista no está activa. Espera a que complete el onboarding antes de ejecutar el pago.'
      );
    }

    const pending = await loadPendingItems(sellerId, vatRegime, itemIds);
    if (pending.length === 0) {
      throw new ApiError(400, 'No hay items pendientes de pago para este régimen');
    }

    const summary = buildPayoutSummary(pending, vatRegime);
    if (summary.total <= 0) {
      throw new ApiError(400, 'El importe a pagar es cero o negativo');
    }

    // App-side uniqueness check (SQLite partial indexes cannot reference
    // other tables). If another admin already included any of these items
    // in an active withdrawal, bail out.
    const conflicts = await findItemsAlreadyInActiveWithdrawal(
      summary.items.map((i) => ({ item_type: i.item_type, item_id: i.item_id }))
    );
    if (conflicts.length > 0) {
      throw new ApiError(
        409,
        `Algunos items ya están incluidos en otro pago activo (ids: ${conflicts
          .map((c) => c.item_id)
          .join(', ')})`
      );
    }

    // Step 1 — local transaction: INSERT withdrawal + items + DEBIT bucket.
    // Note: Turso batches don't return the last-inserted-id until the batch
    // finishes, so we split into: insert withdrawal, read its id, then insert
    // children + debit in a second batch.
    const bucketColumn = bucketColumnFor(vatRegime);

    const insertWithdrawalResult = await db.execute({
      sql: `INSERT INTO withdrawals
            (user_id, amount, iban, status, vat_regime, taxable_base_total, vat_amount_total,
             stripe_transfer_group, executed_by_admin_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      args: [
        sellerId,
        summary.total,
        '', // legacy NOT NULL column — Change #2 no longer uses IBAN
        'processing',
        vatRegime,
        summary.taxable_base,
        summary.vat_amount,
        null, // filled in below once we know the withdrawal id
        req.user.id,
      ],
    });

    const withdrawalId = Number(insertWithdrawalResult.lastInsertRowid);

    const transferGroup = `WITHDRAWAL_${withdrawalId}`;
    const batch = createBatch();
    batch.add(
      'UPDATE withdrawals SET stripe_transfer_group = ? WHERE id = ?',
      [transferGroup, withdrawalId]
    );
    for (const line of summary.items) {
      batch.add(
        `INSERT INTO withdrawal_items
          (withdrawal_id, item_type, item_id, seller_earning, taxable_base, vat_rate, vat_amount, vat_regime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          withdrawalId,
          line.item_type,
          line.item_id,
          line.seller_earning,
          line.taxable_base,
          line.vat_rate,
          line.vat_amount,
          line.vat_regime,
        ]
      );
    }
    batch.add(
      `UPDATE users SET ${bucketColumn} = ${bucketColumn} - ? WHERE id = ? AND ${bucketColumn} >= ?`,
      [summary.total, sellerId, summary.total]
    );
    const batchResults = await batch.execute();

    // The last statement is the bucket debit; if it did not affect a row,
    // the bucket is insufficient — roll everything back and abort.
    const debitResult = batchResults[batchResults.length - 1];
    if (!debitResult || debitResult.rowsAffected === 0) {
      await db.execute({
        sql: 'DELETE FROM withdrawal_items WHERE withdrawal_id = ?',
        args: [withdrawalId],
      });
      await db.execute({
        sql: 'DELETE FROM withdrawals WHERE id = ?',
        args: [withdrawalId],
      });
      throw new ApiError(
        409,
        'El saldo del bucket ha cambiado entre la previsualización y la ejecución. Vuelve a previsualizar.'
      );
    }

    // Step 2 — Stripe transfer.
    let transfer;
    try {
      transfer = await stripeConnectService.createTransfer({
        withdrawal: {
          id: withdrawalId,
          user_id: sellerId,
          amount: summary.total,
          vat_regime: vatRegime,
        },
        connectedAccountId: seller.stripe_connect_account_id,
        itemsCount: summary.items.length,
      });
    } catch (err) {
      // Step 3b — revert: delete children, restore bucket, mark parent failed.
      logger.error(
        { err, withdrawalId, sellerId, vatRegime },
        'Stripe transfer failed — reverting local withdrawal'
      );
      const revertBatch = createBatch();
      revertBatch.add('DELETE FROM withdrawal_items WHERE withdrawal_id = ?', [withdrawalId]);
      revertBatch.add(
        `UPDATE users SET ${bucketColumn} = ${bucketColumn} + ? WHERE id = ?`,
        [summary.total, sellerId]
      );
      revertBatch.add(
        'UPDATE withdrawals SET status = ?, failure_reason = ? WHERE id = ?',
        ['failed', String(err?.message || err || 'unknown').slice(0, 500), withdrawalId]
      );
      try {
        await revertBatch.execute();
      } catch (revertErr) {
        logger.error(
          { revertErr, withdrawalId },
          'Failed to revert local withdrawal after Stripe failure'
        );
      }
      throw new ApiError(502, err?.message || 'Error al ejecutar la transferencia con Stripe');
    }

    // Step 3a — finalize on success.
    await db.execute({
      sql: `UPDATE withdrawals
            SET status = ?, stripe_transfer_id = ?, executed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: ['completed', transfer.id, withdrawalId],
    });

    logger.info(
      {
        withdrawalId,
        sellerId,
        vatRegime,
        amount: summary.total,
        stripeTransferId: transfer.id,
        adminId: req.user.id,
      },
      'Payout executed successfully'
    );

    // Notify the seller (non-blocking).
    try {
      await emailService.sendSellerPayoutExecutedEmail({
        seller,
        withdrawal: {
          id: withdrawalId,
          amount: summary.total,
          vat_regime: vatRegime,
          taxable_base_total: summary.taxable_base,
          vat_amount_total: summary.vat_amount,
          stripe_transfer_id: transfer.id,
        },
        items: summary.items,
      });
    } catch (emailErr) {
      logger.error({ emailErr, withdrawalId }, 'Failed to send payout notification email');
    }

    sendSuccess(res, {
      withdrawal: {
        id: withdrawalId,
        status: 'completed',
        amount: summary.total,
        vat_regime: vatRegime,
        taxable_base_total: summary.taxable_base,
        vat_amount_total: summary.vat_amount,
        stripe_transfer_id: transfer.id,
        stripe_transfer_group: transferGroup,
      },
    }, 200, 'Pago ejecutado correctamente');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/payouts/withdrawals/:withdrawalId/mark-reversed
 * Manual reflection of a reversal performed by the admin in the Stripe dashboard.
 */
async function markReversed(req, res, next) {
  try {
    const withdrawalId = parseInt(req.params.withdrawalId, 10);
    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
      throw new ApiError(400, 'withdrawalId inválido');
    }

    const { reversal_amount: reversalAmount, reversal_reason: reversalReason } = req.body;

    const withdrawalResult = await db.execute({
      sql: 'SELECT * FROM withdrawals WHERE id = ?',
      args: [withdrawalId],
    });
    if (withdrawalResult.rows.length === 0) {
      throw new ApiError(404, 'Withdrawal no encontrado');
    }
    const withdrawal = withdrawalResult.rows[0];

    if (withdrawal.status !== 'completed') {
      throw new ApiError(
        409,
        `Sólo se pueden marcar como revertidos los pagos en estado 'completed' (actual: ${withdrawal.status})`
      );
    }

    const bucketColumn = bucketColumnFor(withdrawal.vat_regime);

    const batch = createBatch();
    batch.add(
      `UPDATE withdrawals
       SET status = ?, reversed_at = CURRENT_TIMESTAMP, reversal_amount = ?, reversal_reason = ?
       WHERE id = ?`,
      ['reversed', reversalAmount, reversalReason, withdrawalId]
    );
    batch.add(
      `UPDATE users SET ${bucketColumn} = ${bucketColumn} + ? WHERE id = ?`,
      [reversalAmount, withdrawal.user_id]
    );
    await batch.execute();

    logger.info(
      {
        withdrawalId,
        userId: Number(withdrawal.user_id),
        reversalAmount,
        vat_regime: withdrawal.vat_regime,
        adminId: req.user.id,
      },
      'Payout marked as reversed by admin'
    );

    sendSuccess(res, {
      withdrawal: {
        id: withdrawalId,
        status: 'reversed',
        reversal_amount: reversalAmount,
        reversal_reason: reversalReason,
      },
    }, 200, 'Pago marcado como revertido');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listSellersWithBalance,
  getSellerPayoutDetail,
  previewPayout,
  executePayout,
  markReversed,
  // Exposed for tests / for the webhook controller:
  findItemsAlreadyInActiveWithdrawal,
  bucketColumnFor,
};
