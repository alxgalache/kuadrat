/**
 * Admin Stripe Connect Payouts routes — Change #2: stripe-connect-manual-payouts
 *
 * Mounted under /api/admin/payouts (parent applies `authenticate` + `adminAuth`).
 * Exposes the admin payouts panel endpoints: listing sellers with balance,
 * previewing a payout (with single-use confirmation token), executing it,
 * and reflecting a manual reversal made from the Stripe dashboard.
 */
const express = require('express');
const router = express.Router();
const payoutsCtrl = require('../../controllers/stripeConnectPayoutsController');
const { validate } = require('../../middleware/validate');
const {
  previewPayoutSchema,
  executePayoutSchema,
  markReversedSchema,
} = require('../../validators/stripeConnectPayoutsSchemas');

// List all sellers with positive balance in at least one VAT bucket.
router.get('/', payoutsCtrl.listSellersWithBalance);

// Full payout detail for a single seller (both buckets, pending items, history).
router.get('/:sellerId', payoutsCtrl.getSellerPayoutDetail);

// Preview a payout (non-persistent) — returns a single-use confirmation token.
router.post(
  '/:sellerId/preview',
  validate(previewPayoutSchema),
  payoutsCtrl.previewPayout
);

// Execute a payout — consumes the confirmation token, runs the local
// transaction, calls Stripe, and finalizes or rolls back on failure.
router.post(
  '/:sellerId/execute',
  validate(executePayoutSchema),
  payoutsCtrl.executePayout
);

// Manually flag a completed withdrawal as reversed (when the admin triggered
// the reversal from the Stripe dashboard and we need the local state to match).
router.post(
  '/withdrawals/:withdrawalId/mark-reversed',
  validate(markReversedSchema),
  payoutsCtrl.markReversed
);

module.exports = router;
