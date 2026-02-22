const express = require('express')
const router = express.Router()
const {
  getAllOrdersAdmin,
  getOrderByIdAdmin,
} = require('../../controllers/ordersController')

/**
 * GET /api/admin/orders
 * Get all orders
 */
router.get('/', getAllOrdersAdmin);

/**
 * GET /api/admin/orders/:id
 * Get order details by ID
 */
router.get('/:id', getOrderByIdAdmin);

module.exports = router
