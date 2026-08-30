const express = require('express');
const router = express.Router();
const { validate } = require('../../middleware/validate');
const { startImpersonationSchema } = require('../../validators/impersonationSchemas');
const { startImpersonation } = require('../../controllers/impersonationController');

/**
 * Admin impersonation — the START half only (admin-user-impersonation).
 *
 * `authenticate` + `adminAuth` are applied once in routes/admin/index.js, so
 * reaching this handler already proves the caller is an admin.
 *
 * The STOP half deliberately lives in routes/authRoutes.js instead: it is
 * reached carrying the impersonated user's token, which adminAuth would
 * reject. See the comment there.
 */

// POST /api/admin/impersonation/:userId/start
router.post('/:userId/start', validate(startImpersonationSchema), startImpersonation);

module.exports = router;
