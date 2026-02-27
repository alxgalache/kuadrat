const express = require('express');
const router = express.Router();
const drawController = require('../controllers/drawController');
const { cacheControl } = require('../middleware/cache');
const { validate } = require('../middleware/validate');
const {
  registerBuyerSchema,
  verifyBuyerSchema,
  setupPaymentSchema,
  confirmPaymentSchema,
  enterDrawSchema,
} = require('../validators/drawSchemas');

// All routes are public (no authentication required)

/**
 * GET /api/draws
 * Get draws by date range (for calendar view)
 */
router.get('/', cacheControl({ maxAge: 30 }), drawController.getDraws);

/**
 * GET /api/draws/:id
 * Get draw details with product data
 */
router.get('/:id', cacheControl({ maxAge: 10 }), drawController.getDrawDetail);

/**
 * POST /api/draws/:id/register-buyer
 * Register a new participant or get existing
 */
router.post('/:id/register-buyer', validate(registerBuyerSchema), drawController.registerBuyer);

/**
 * POST /api/draws/:id/verify-buyer
 * Verify returning participant with email + password
 */
router.post('/:id/verify-buyer', validate(verifyBuyerSchema), drawController.verifyBuyer);

/**
 * POST /api/draws/:id/setup-payment
 * Create Stripe SetupIntent for 0 EUR authorization
 */
router.post('/:id/setup-payment', validate(setupPaymentSchema), drawController.setupPayment);

/**
 * POST /api/draws/:id/confirm-payment
 * Confirm payment and save payment method data
 */
router.post('/:id/confirm-payment', validate(confirmPaymentSchema), drawController.confirmPayment);

/**
 * POST /api/draws/:id/enter
 * Enter the draw (create participation)
 */
router.post('/:id/enter', validate(enterDrawSchema), drawController.enterDraw);

module.exports = router;
