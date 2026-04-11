/**
 * Admin Stripe Connect Fiscal Report routes — Change #4: stripe-connect-fiscal-report
 *
 * Mounted under /api/admin/payouts (parent applies `authenticate` + `adminAuth`).
 * This router is mounted BEFORE the existing payouts router in
 * `api/routes/admin/index.js` so that its specific paths beat the parametric
 * `GET /:sellerId` route of the manual-payouts panel (Change #2).
 *
 * Endpoints:
 *   GET /payouts/fiscal-export               → range export (csv|json)
 *   GET /payouts/summary                     → totals by regime/month (json)
 *   GET /payouts/:withdrawalId/fiscal-export → single payout (csv|json)
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/stripeConnectFiscalReportController');
const { validate } = require('../../middleware/validate');
const {
  singlePayoutExportQuerySchema,
  rangeExportQuerySchema,
  summaryQuerySchema,
} = require('../../validators/stripeConnectFiscalReportSchemas');

// Specific routes first — see the note at the top of the file.
router.get('/fiscal-export', validate(rangeExportQuerySchema), ctrl.exportRange);
router.get('/summary', validate(summaryQuerySchema), ctrl.getSummary);
router.get(
  '/:withdrawalId/fiscal-export',
  validate(singlePayoutExportQuerySchema),
  ctrl.exportSinglePayout
);

module.exports = router;
