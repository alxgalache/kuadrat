const express = require('express');
const router = express.Router();
const {
  placeOrder,
  confirmOrderPayment,
  getUserOrders,
  getOrderById,
  getSellerStats,
  getOrderByToken,
  contactSellerForOrder,
  updateItemTracking,
  updateItemStatus,
  updateOrderStatus,
  updateItemStatusPublic,
  updateOrderStatusPublic,
} = require('../controllers/ordersController');
const { authenticate, optionalAuthenticate, requireAuth } = require('../middleware/authorization');
const { validate } = require('../middleware/validate');
const { publicUpdateItemStatusSchema, publicUpdateOrderStatusSchema } = require('../validators/orderSchemas');
const { sensitiveLimiter } = require('../middleware/rateLimiter');

// Place order for an existing Revolut/Stripe payment (Card Field checkout)
router.post('/placeOrder', sensitiveLimiter, optionalAuthenticate, placeOrder);

// Confirm order payment (attach Revolut info and mark as paid)
router.put('/', sensitiveLimiter, optionalAuthenticate, confirmOrderPayment);

// Get seller stats for orders (current and previous periods)
router.get('/stats', authenticate, requireAuth, getSellerStats);

// Public order detail by token
router.get('/public/token/:token', getOrderByToken);

// Public contact seller for an order (token-based)
router.post('/public/token/:token/contact', contactSellerForOrder);

// Public: buyer updates item status (token-based, no auth)
router.patch('/public/token/:token/items/:itemId/status', validate(publicUpdateItemStatusSchema), updateItemStatusPublic);

// Public: buyer updates order status (token-based, no auth)
router.patch('/public/token/:token/status', validate(publicUpdateOrderStatusSchema), updateOrderStatusPublic);

// Get orders - requires authentication
router.get('/', authenticate, requireAuth, getUserOrders);
router.get('/:id', authenticate, requireAuth, getOrderById);

// Update order item tracking and status - requires authentication
router.patch('/:orderId/items/:itemId/tracking', authenticate, requireAuth, updateItemTracking);
router.patch('/:orderId/items/:itemId/status', authenticate, requireAuth, updateItemStatus);
router.patch('/:orderId/status', authenticate, requireAuth, updateOrderStatus);

module.exports = router;
