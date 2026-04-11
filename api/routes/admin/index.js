const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authorization');
const adminAuth = require('../../middleware/adminAuth');

// Apply authentication and admin authorization to all admin routes
router.use(authenticate, adminAuth);

// Mount sub-route modules
router.use('/authors', require('./authorRoutes'));
router.use('/products', require('./productRoutes'));
router.use('/others', require('./othersRoutes'));
router.use('/orders', require('./orderRoutes'));
router.use('/shipping', require('./shippingRoutes'));
router.use('/auctions', require('./auctionRoutes'));
router.use('/postal-codes', require('./postalCodeRoutes'));
router.use('/events', require('./eventRoutes'));
router.use('/draws', require('./drawRoutes'));
// Stripe Connect lifecycle + fiscal data (Change #1: stripe-connect-accounts)
// Mounted at the admin root because the paths are seller-scoped, not under a prefix.
router.use('/', require('./stripeConnectRoutes'));
// Stripe Connect fiscal report export (Change #4: stripe-connect-fiscal-report).
// Mounted BEFORE the manual-payouts router so that `/payouts/fiscal-export`
// and `/payouts/summary` beat the parametric `/payouts/:sellerId` route.
router.use('/payouts', require('./stripeConnectFiscalReportRoutes'));
// Stripe Connect manual payouts panel (Change #2: stripe-connect-manual-payouts)
router.use('/payouts', require('./stripeConnectPayoutsRoutes'));

module.exports = router;
