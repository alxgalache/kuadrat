const express = require('express');
const router = express.Router();
const {
  getVisibleAuthors,
  getAuthorBySlug,
  getAuthorImage,
} = require('../controllers/usersController');

// Public routes
router.get('/authors', getVisibleAuthors);
router.get('/authors/images/:filename', getAuthorImage);
router.get('/authors/:slug', getAuthorBySlug);

module.exports = router;
