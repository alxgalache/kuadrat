const express = require('express')
const router = express.Router()
const {
  getAllShippingMethods,
  getShippingMethodById,
  createShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
  getShippingZones,
  createShippingZone,
  updateShippingZone,
  deleteShippingZone,
} = require('../../controllers/shippingController')

/**
 * GET /api/admin/envios/methods
 * Get all shipping methods
 */
router.get('/methods', getAllShippingMethods);

/**
 * GET /api/admin/envios/methods/:id
 * Get shipping method by ID
 */
router.get('/methods/:id', getShippingMethodById);

/**
 * POST /api/admin/envios/methods
 * Create a new shipping method
 */
router.post('/methods', createShippingMethod);

/**
 * PUT /api/admin/envios/methods/:id
 * Update a shipping method
 */
router.put('/methods/:id', updateShippingMethod);

/**
 * DELETE /api/admin/envios/methods/:id
 * Delete a shipping method
 */
router.delete('/methods/:id', deleteShippingMethod);

/**
 * GET /api/admin/envios/methods/:methodId/zones
 * Get all zones for a shipping method
 */
router.get('/methods/:methodId/zones', getShippingZones);

/**
 * POST /api/admin/envios/methods/:methodId/zones
 * Create a new zone for a shipping method
 */
router.post('/methods/:methodId/zones', createShippingZone);

/**
 * PUT /api/admin/envios/zones/:zoneId
 * Update a shipping zone
 */
router.put('/zones/:zoneId', updateShippingZone);

/**
 * DELETE /api/admin/envios/zones/:zoneId
 * Delete a shipping zone
 */
router.delete('/zones/:zoneId', deleteShippingZone);

module.exports = router
