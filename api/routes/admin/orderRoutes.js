const express = require('express')
const router = express.Router()
const {
  getAllOrdersAdmin,
  getOrderByIdAdmin,
  updateItemStatusAdmin,
  updateOrderStatusAdmin,
  getStaleArrivedItems,
  getStaleSentItems,
} = require('../../controllers/ordersController')
const { validate } = require('../../middleware/validate')
const { adminUpdateItemStatusSchema, adminUpdateOrderStatusSchema } = require('../../validators/orderSchemas')

/**
 * GET /api/admin/orders
 * Get all orders
 */
router.get('/', getAllOrdersAdmin);

/**
 * GET /api/admin/orders/alerts/stale-arrived
 * Get items stuck in "arrived" status for more than 10 days and send alert email
 */
router.get('/alerts/stale-arrived', getStaleArrivedItems);

/**
 * GET /api/admin/orders/alerts/stale-sent
 * Get items stuck in "sent" status for more than 15 days and send alert email
 */
router.get('/alerts/stale-sent', getStaleSentItems);

/**
 * GET /api/admin/orders/:id
 * Get order details by ID
 */
router.get('/:id', getOrderByIdAdmin);

/**
 * PATCH /api/admin/orders/:orderId/items/:itemId/status
 * Admin: change a single item's status
 */
router.patch('/:orderId/items/:itemId/status', validate(adminUpdateItemStatusSchema), updateItemStatusAdmin);

/**
 * PATCH /api/admin/orders/:orderId/status
 * Admin: change order status and all items' statuses
 */
router.patch('/:orderId/status', validate(adminUpdateOrderStatusSchema), updateOrderStatusAdmin);

module.exports = router
