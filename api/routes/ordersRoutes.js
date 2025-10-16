const express = require('express');
const router = express.Router();
const {
  createOrder,
  getUserOrders,
  getOrderById,
} = require('../controllers/ordersController');
const { authenticate, requireAuth } = require('../middleware/authorization');

// All order routes require authentication
router.post('/', authenticate, requireAuth, createOrder);
router.get('/', authenticate, requireAuth, getUserOrders);
router.get('/:id', authenticate, requireAuth, getOrderById);

module.exports = router;
