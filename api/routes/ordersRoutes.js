const express = require('express');
const router = express.Router();
const {
  createOrder,
  getUserOrders,
  getOrderById,
} = require('../controllers/ordersController');
const { authenticate, optionalAuthenticate, requireAuth } = require('../middleware/authorization');

// Create order - optional authentication (supports guest checkout)
router.post('/', optionalAuthenticate, createOrder);

// Get orders - requires authentication
router.get('/', authenticate, requireAuth, getUserOrders);
router.get('/:id', authenticate, requireAuth, getOrderById);

module.exports = router;
