const express = require('express');
const router = express.Router();
const {
  login,
  registrationRequest,
  validateSetupToken,
  setPassword,
  getPasswordRequirements,
} = require('../controllers/authController');

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

// GET /api/auth/password-requirements
// Returns password requirements for frontend validation
router.get('/password-requirements', getPasswordRequirements);

module.exports = router;
