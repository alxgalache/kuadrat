const express = require('express');
const router = express.Router();
const {
  createOrder,
  confirmOrderPayment,
  getUserOrders,
  getOrderById,
} = require('../controllers/ordersController');
const { authenticate, optionalAuthenticate, requireAuth } = require('../middleware/authorization');

// Create order - optional authentication (supports guest checkout)
router.post('/', optionalAuthenticate, createOrder);

// Confirm order payment (attach Revolut info and mark as paid)
router.put('/', optionalAuthenticate, confirmOrderPayment);

// Get orders - requires authentication
router.get('/', authenticate, requireAuth, getUserOrders);
router.get('/:id', authenticate, requireAuth, getOrderById);

module.exports = router;
