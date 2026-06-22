const express = require('express');
const router = express.Router();

const { inquiryLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { newsletterSubscribeSchema } = require('../validators/newsletterSchemas');
const { subscribe } = require('../controllers/newsletterController');

// Public, no-auth signup. Reuses the inquiry limiter (tight per-IP anti-abuse).
router.post(
  '/subscribe',
  inquiryLimiter,
  validate(newsletterSubscribeSchema),
  subscribe,
);

module.exports = router;
