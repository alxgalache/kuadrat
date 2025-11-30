const express = require('express');
const router = express.Router();
const {
  createOrder,
  placeOrder,
  confirmOrderPayment,
  getUserOrders,
  getOrderById,
  getSellerStats,
} = require('../controllers/ordersController');
const { authenticate, optionalAuthenticate, requireAuth } = require('../middleware/authorization');

// Legacy popup flow (still used by some paths) - optional authentication
router.post('/', optionalAuthenticate, createOrder);

// New Card Field flow - order is placed for an existing Revolut order id
router.post('/placeOrder', optionalAuthenticate, placeOrder);

// Confirm order payment (attach Revolut info and mark as paid)
router.put('/', optionalAuthenticate, confirmOrderPayment);

// Get seller stats for orders (current and previous periods)
router.get('/stats', authenticate, requireAuth, getSellerStats);

// Get orders - requires authentication
router.get('/', authenticate, requireAuth, getUserOrders);
router.get('/:id', authenticate, requireAuth, getOrderById);

module.exports = router;
