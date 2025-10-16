const express = require('express');
const router = express.Router();
const { login, registrationRequest } = require('../controllers/authController');

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/registration-request
router.post('/registration-request', registrationRequest);

module.exports = router;
