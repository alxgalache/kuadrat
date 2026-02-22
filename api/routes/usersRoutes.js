const express = require('express');
const router = express.Router();
const {
  getVisibleAuthors,
  getAuthorBySlug,
  getAuthorImage,
} = require('../controllers/usersController');
const { cacheControl } = require('../middleware/cache');

// Public routes with caching
router.get('/authors', cacheControl({ maxAge: 300 }), getVisibleAuthors);
router.get('/authors/images/:filename', cacheControl({ maxAge: 86400 }), getAuthorImage);
router.get('/authors/:slug', cacheControl({ maxAge: 300 }), getAuthorBySlug);

module.exports = router;
