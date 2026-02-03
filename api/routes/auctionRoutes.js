const express = require('express');
const router = express.Router();
const auctionController = require('../controllers/auctionController');

// All routes are public (no authentication required)

/**
 * GET /api/auctions
 * Get auctions by date range (for calendar view)
 */
router.get('/', auctionController.getAuctions);

/**
 * GET /api/auctions/:id
 * Get auction details with products
 */
router.get('/:id', auctionController.getAuctionDetail);

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
 * Get allowed postal codes for a product in an auction
 */
router.get('/:id/postal-codes/:productId/:productType', auctionController.getPostalCodes);

module.exports = router;
