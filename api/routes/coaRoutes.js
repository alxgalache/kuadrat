const express = require('express');
const router = express.Router();

const { coaVerifyLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { noCache } = require('../middleware/cache');
const { coaVerifyQuerySchema } = require('../validators/coaSchemas');
const { verifyCoa } = require('../controllers/coaController');

// Public, unauthenticated endpoint hit by collectors' phones when they tap
// the sticker. The chip mirrors the encrypted PICC + truncated CMAC into the
// query string of the SUN URL written to the NDEF.
router.get(
  '/verify',
  coaVerifyLimiter,
  validate(coaVerifyQuerySchema),
  noCache(),
  verifyCoa,
);

module.exports = router;
