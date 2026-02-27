const express = require('express')
const router = express.Router()
const drawAdminController = require('../../controllers/drawAdminController')
const { validate } = require('../../middleware/validate')
const { createDrawSchema, updateDrawSchema } = require('../../validators/drawSchemas')

/**
 * POST /api/admin/draws
 * Create a new draw
 */
router.post('/', validate(createDrawSchema), drawAdminController.createDraw);

/**
 * GET /api/admin/draws
 * List all draws
 */
router.get('/', drawAdminController.listDraws);

/**
 * GET /api/admin/draws/:id
 * Get draw details
 */
router.get('/:id', drawAdminController.getDraw);

/**
 * PUT /api/admin/draws/:id
 * Update draw
 */
router.put('/:id', validate(updateDrawSchema), drawAdminController.updateDraw);

/**
 * DELETE /api/admin/draws/:id
 * Delete draw
 */
router.delete('/:id', drawAdminController.deleteDraw);

/**
 * POST /api/admin/draws/:id/start
 * Start draw
 */
router.post('/:id/start', drawAdminController.startDraw);

/**
 * POST /api/admin/draws/:id/cancel
 * Cancel draw
 */
router.post('/:id/cancel', drawAdminController.cancelDraw);

module.exports = router
