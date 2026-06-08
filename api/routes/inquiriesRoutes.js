const express = require('express');
const router = express.Router();

const { inquiryLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { artInquirySchema, quoteRequestSchema } = require('../validators/inquirySchemas');
const { createArtInquiry, createQuoteRequest } = require('../controllers/inquiriesController');

router.post(
  '/art',
  inquiryLimiter,
  validate(artInquirySchema),
  createArtInquiry,
);

router.post(
  '/quote',
  inquiryLimiter,
  validate(quoteRequestSchema),
  createQuoteRequest,
);

module.exports = router;
