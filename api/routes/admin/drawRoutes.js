const express = require('express')
const router = express.Router()
const drawAdminController = require('../../controllers/drawAdminController')
const { validate } = require('../../middleware/validate')
const { createDrawSchema, updateDrawSchema, billParticipationSchema } = require('../../validators/drawSchemas')

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

/**
 * POST /api/admin/draws/:id/finish
 * Manually finish draw
 */
router.post('/:id/finish', drawAdminController.finishDraw);

/**
 * GET /api/admin/draws/:id/participations
 * Get draw participations with buyer details
 */
router.get('/:id/participations', drawAdminController.getParticipations);

/**
 * POST /api/admin/draws/:id/participations/:participationId/bill
 * Bill a draw participation (create order + charge)
 */
router.post('/:id/participations/:participationId/bill', validate(billParticipationSchema), drawAdminController.billParticipation);

module.exports = router
