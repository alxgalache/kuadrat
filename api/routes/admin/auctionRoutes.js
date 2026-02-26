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

module.exports = router
