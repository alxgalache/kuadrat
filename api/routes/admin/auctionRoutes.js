const express = require('express')
const router = express.Router()
const auctionAdminController = require('../../controllers/auctionAdminController')

/**
 * POST /api/admin/subastas
 * Create a new auction
 */
router.post('/', auctionAdminController.createAuction);

/**
 * GET /api/admin/subastas
 * List all auctions
 */
router.get('/', auctionAdminController.listAuctions);

/**
 * GET /api/admin/subastas/:id
 * Get auction details
 */
router.get('/:id', auctionAdminController.getAuction);

/**
 * PUT /api/admin/subastas/:id
 * Update auction
 */
router.put('/:id', auctionAdminController.updateAuction);

/**
 * DELETE /api/admin/subastas/:id
 * Delete auction
 */
router.delete('/:id', auctionAdminController.deleteAuction);

/**
 * POST /api/admin/subastas/:id/start
 * Start auction
 */
router.post('/:id/start', auctionAdminController.startAuction);

/**
 * POST /api/admin/subastas/:id/cancel
 * Cancel auction
 */
router.post('/:id/cancel', auctionAdminController.cancelAuction);

/**
 * POST /api/admin/subastas/:id/finish
 * Manually finish auction
 */
router.post('/:id/finish', auctionAdminController.finishAuction);

/**
 * GET /api/admin/subastas/:id/bids
 * List all bids for an auction with buyer info
 */
router.get('/:id/bids', auctionAdminController.getAuctionBids);

/**
 * POST /api/admin/subastas/:id/bids/:bidId/bill
 * Create order + charge buyer for a winning bid
 */
router.post('/:id/bids/:bidId/bill', auctionAdminController.billBid);

module.exports = router
