const express = require('express');
const config = require('../config/env');

const router = express.Router();

const isGateEnabled = () => {
  const flag = config.webAppHidden;
  return flag === 'true' || flag === '1';
};

// Simple password verification endpoint used by the frontend test-access gate.
// When WEB_APP_HIDDEN is not enabled, this route behaves as if it does not exist
// to avoid exposing any information in public environments.
router.post('/verify', (req, res) => {
  if (!isGateEnabled()) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  const expectedPassword = config.testAccessPassword;
  if (!expectedPassword) {
    return res.status(500).json({ success: false, message: 'Test access password not configured' });
  }

  const { password } = req.body || {};

  if (typeof password !== 'string' || password.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }

  if (password === expectedPassword) {
    return res.json({ success: true });
  }

  return res.status(401).json({ success: false, message: 'Invalid password' });
});

module.exports = router;
