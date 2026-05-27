const express = require('express');
const router = express.Router();

const { inquiryLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { artInquirySchema } = require('../validators/inquirySchemas');
const { createArtInquiry } = require('../controllers/inquiriesController');

router.post(
  '/art',
  inquiryLimiter,
  validate(artInquirySchema),
  createArtInquiry,
);

module.exports = router;
