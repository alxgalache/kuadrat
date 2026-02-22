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
 * GET /api/admin/postal-codes/search
 * Search postal codes by postal_code or city (async multi-select)
 * NOTE: Must be registered BEFORE the base /postal-codes route
 */
router.get('/postal-codes/search', auctionAdminController.searchPostalCodes);

/**
 * GET /api/admin/postal-codes/by-ids
 * Get postal codes by IDs (for loading pre-selected values)
 */
router.get('/postal-codes/by-ids', auctionAdminController.getPostalCodesByIds);

/**
 * POST /api/admin/postal-codes/by-refs
 * Resolve postal refs to display format (for pre-populating select)
 */
router.post('/postal-codes/by-refs', auctionAdminController.getPostalCodesByRefs);

/**
 * GET /api/admin/postal-codes
 * List all postal codes
 */
router.get('/postal-codes', auctionAdminController.listPostalCodes);

/**
 * POST /api/admin/postal-codes
 * Create postal code
 */
router.post('/postal-codes', auctionAdminController.createPostalCode);

module.exports = router
