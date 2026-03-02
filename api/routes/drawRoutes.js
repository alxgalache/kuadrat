const express = require('express');
const router = express.Router();
const drawController = require('../controllers/drawController');
const { cacheControl } = require('../middleware/cache');
const { validate } = require('../middleware/validate');
const {
  registerBuyerSchema,
  sendVerificationSchema,
  verifyEmailSchema,
  setupPaymentSchema,
  confirmPaymentSchema,
  enterDrawSchema,
  validatePostalCodeSchema,
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
 * POST /api/draws/:id/send-verification
 * Validate DNI, check uniqueness, send email OTP
 */
router.post('/:id/send-verification', validate(sendVerificationSchema), drawController.sendVerification);

/**
 * POST /api/draws/:id/verify-email
 * Verify email OTP code
 */
router.post('/:id/verify-email', validate(verifyEmailSchema), drawController.verifyEmail);

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

/**
 * POST /api/draws/:id/validate-postal-code
 * Validate postal code against seller's shipping zones
 */
router.post('/:id/validate-postal-code', validate(validatePostalCodeSchema), drawController.validatePostalCode);

module.exports = router;
