const express = require('express');
const router = express.Router();
const auctionController = require('../controllers/auctionController');
const { cacheControl } = require('../middleware/cache');
const { sensitiveLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { sendVerificationSchema, verifyEmailSchema } = require('../validators/auctionSchemas');

// All routes are public (no authentication required)

/**
 * GET /api/auctions
 * Get auctions by date range (for calendar view)
 */
router.get('/', cacheControl({ maxAge: 30 }), auctionController.getAuctions);

/**
 * GET /api/auctions/:id
 * Get auction details with products
 */
router.get('/:id', cacheControl({ maxAge: 10 }), auctionController.getAuctionDetail);

/**
 * GET /api/auctions/:id/products/:productId/:productType/bids
 * Get recent bids for a product
 */
router.get('/:id/products/:productId/:productType/bids', auctionController.getProductBids);

/**
 * POST /api/auctions/:id/register-buyer
 * Register a new buyer or get existing buyer
 */
router.post('/:id/register-buyer', auctionController.registerBuyer);

/**
 * POST /api/auctions/:id/verify-buyer
 * Verify returning buyer with email + bid_password
 */
router.post('/:id/verify-buyer', auctionController.verifyBuyer);

/**
 * POST /api/auctions/:id/setup-payment
 * Create Stripe PaymentIntent for 1 EUR authorization
 */
router.post('/:id/setup-payment', auctionController.setupPayment);

/**
 * POST /api/auctions/:id/confirm-payment
 * Confirm payment and save payment method data
 */
router.post('/:id/confirm-payment', auctionController.confirmPayment);

/**
 * POST /api/auctions/:id/bid
 * Place a bid on a product
 */
router.post('/:id/bid', auctionController.placeBid);

/**
 * GET /api/auctions/:id/postal-codes/:productId/:productType
 * Get allowed postal refs for a product in an auction
 */
router.get('/:id/postal-codes/:productId/:productType', auctionController.getPostalCodes);

/**
 * GET /api/auctions/:id/validate-postal-code/:productId/:productType?postalCode=...
 * Validate whether a buyer's postal code is allowed for a product
 */
router.get('/:id/validate-postal-code/:productId/:productType', auctionController.validatePostalCode);

/**
 * POST /api/auctions/:id/send-verification
 * Send OTP code to buyer email for identity verification
 */
router.post('/:id/send-verification', sensitiveLimiter, validate(sendVerificationSchema), auctionController.sendVerification);

/**
 * POST /api/auctions/:id/verify-email
 * Verify OTP code sent to buyer email
 */
router.post('/:id/verify-email', sensitiveLimiter, validate(verifyEmailSchema), auctionController.verifyEmail);

module.exports = router;
