/**
 * Admin invoice routes — PDF generation endpoints.
 *
 * All routes are protected by authenticate + adminAuth via the
 * admin router index.
 */

const express = require('express');
const router = express.Router();
const invoiceController = require('../../controllers/invoiceController');

// Buyer invoice (REBU or Standard) for an order
// GET /admin/invoices/order/:orderId/buyer?type=rebu|standard
router.get('/order/:orderId/buyer', invoiceController.getBuyerInvoice);

// Event attendee invoice
// GET /admin/invoices/event-attendee/:attendeeId
router.get('/event-attendee/:attendeeId', invoiceController.getEventAttendeeInvoice);

// Commission invoice for a completed standard_vat withdrawal
// GET /admin/invoices/withdrawal/:withdrawalId/commission
router.get('/withdrawal/:withdrawalId/commission', invoiceController.getCommissionInvoice);

// Settlement note for a completed art_rebu withdrawal
// GET /admin/invoices/withdrawal/:withdrawalId/settlement
router.get('/withdrawal/:withdrawalId/settlement', invoiceController.getSettlementNote);

module.exports = router;
