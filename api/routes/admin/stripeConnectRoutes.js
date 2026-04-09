/**
 * Admin Stripe Connect routes — Change #1: stripe-connect-accounts
 *
 * Mounted under /api/admin (parent applies `authenticate` + `adminAuth`).
 * Exposes the seller-scoped connected-account lifecycle endpoints and the
 * fiscal-data update endpoint.
 */
const express = require('express');
const router = express.Router();
const stripeConnectCtrl = require('../../controllers/stripeConnectController');
const usersCtrl = require('../../controllers/usersController');
const { validate } = require('../../middleware/validate');
const { sellerFiscalDataSchema } = require('../../validators/fiscalSchemas');

// Stripe Connect account lifecycle
router.post('/sellers/:id/stripe-connect/create', stripeConnectCtrl.createAccountForSeller);
router.post('/sellers/:id/stripe-connect/onboarding-link', stripeConnectCtrl.generateOnboardingLinkForSeller);
router.post('/sellers/:id/stripe-connect/onboarding-link/email', stripeConnectCtrl.sendOnboardingLinkEmail);
router.get('/sellers/:id/stripe-connect/status', stripeConnectCtrl.syncStatusForSeller);

// Fiscal data
router.put('/sellers/:id/fiscal', validate(sellerFiscalDataSchema), usersCtrl.updateSellerFiscalData);

module.exports = router;
