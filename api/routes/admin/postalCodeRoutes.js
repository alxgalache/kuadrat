const express = require('express')
const router = express.Router()
const auctionAdminController = require('../../controllers/auctionAdminController')

/**
 * GET /api/admin/postal-codes/search
 * Search postal codes by postal_code or city (async multi-select)
 * NOTE: Must be registered BEFORE the base /postal-codes route
 */
router.get('/search', auctionAdminController.searchPostalCodes);

/**
 * GET /api/admin/postal-codes/by-ids
 * Get postal codes by IDs (for loading pre-selected values)
 */
router.get('/by-ids', auctionAdminController.getPostalCodesByIds);

/**
 * POST /api/admin/postal-codes/by-refs
 * Resolve postal refs to display format (for pre-populating select)
 */
router.post('/by-refs', auctionAdminController.getPostalCodesByRefs);

/**
 * GET /api/admin/postal-codes
 * List all postal codes
 */
router.get('/', auctionAdminController.listPostalCodes);

/**
 * POST /api/admin/postal-codes
 * Create postal code
 */
router.post('/', auctionAdminController.createPostalCode);

module.exports = router
