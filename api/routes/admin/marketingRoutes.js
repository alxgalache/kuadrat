const express = require('express');
const router = express.Router();
const marketingController = require('../../controllers/marketingController');
const { validate } = require('../../middleware/validate');
const { sensitiveLimiter } = require('../../middleware/rateLimiter');
const { announceAuthorSchema } = require('../../validators/marketingSchemas');

// Note: authentication + admin authorization are applied once in routes/admin/index.js.

/**
 * GET /api/admin/marketing/authors
 * Visible authors for the "new author" announcement picker.
 */
router.get('/authors', marketingController.listAuthorsForAnnounce);

/**
 * POST /api/admin/marketing/announce-author
 * Trigger the "new author" marketing broadcast.
 */
router.post('/announce-author', sensitiveLimiter, validate(announceAuthorSchema), marketingController.announceAuthor);

/**
 * GET /api/admin/marketing/sends
 * Paginated audit history of marketing broadcasts.
 */
router.get('/sends', marketingController.listMarketingSends);

module.exports = router;
