const express = require('express');
const router = express.Router();
const {
  login,
  registrationRequest,
  validateSetupToken,
  setPassword,
  validateResetToken,
  resetPassword,
  getPasswordRequirements,
} = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { sensitiveLimiter } = require('../middleware/rateLimiter');
const { resetPasswordSchema } = require('../validators/passwordResetSchemas');
const { authenticate } = require('../middleware/authorization');
const { stopImpersonation } = require('../controllers/impersonationController');

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/registration-request
router.post('/registration-request', registrationRequest);

// GET /api/auth/validate-setup-token/:token
// Validates a password setup token and returns user info
router.get('/validate-setup-token/:token', validateSetupToken);

// POST /api/auth/set-password
// Sets the password for a user using a valid setup token
router.post('/set-password', setPassword);

// GET /api/auth/validate-reset-token/:token
// Validates an admin-initiated password reset token. Rate-limited: the token
// is not guessable, but the limiter turns an attempt into logged noise
// instead of traffic.
router.get('/validate-reset-token/:token', sensitiveLimiter, validateResetToken);

// POST /api/auth/reset-password
// Sets a new password using a valid reset token. Returns no session.
router.post('/reset-password', sensitiveLimiter, validate(resetPasswordSchema), resetPassword);

// GET /api/auth/password-requirements
// Returns password requirements for frontend validation
router.get('/password-requirements', getPasswordRequirements);

// POST /api/auth/impersonation/stop
//
// Ends an impersonation and hands back an admin session. It CANNOT live under
// routes/admin/: it is reached carrying the impersonated user's token, whose
// role is 'seller', so adminAuth would reject every legitimate call. Its
// authority comes instead from the signed `act` claim — which the caller
// cannot forge — plus the re-validation of that actor's current role and
// password_changed_at inside the controller.
router.post('/impersonation/stop', sensitiveLimiter, authenticate, stopImpersonation);

module.exports = router;
