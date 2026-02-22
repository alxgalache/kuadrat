const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  getAllArtProducts,
  getArtProductById,
  createArtProduct,
  deleteArtProduct,
  getSellerArtProducts,
  getArtProductImage,
  getArtProductsByAuthorSlug,
} = require('../controllers/artController');
const { authenticate, requireSeller } = require('../middleware/authorization');
const { cacheControl } = require('../middleware/cache');

// Multer configuration for image uploads (PNG, JPG, WEBP) up to 10MB (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PNG, JPG, and WEBP images are allowed'));
  },
});

// Public routes with caching
router.get('/', cacheControl({ maxAge: 60 }), getAllArtProducts);
router.get('/images/:basename', cacheControl({ maxAge: 86400 }), getArtProductImage);
router.get('/author/:slug', cacheControl({ maxAge: 120 }), getArtProductsByAuthorSlug);

// Protected routes - Seller only
router.get('/seller/me', authenticate, requireSeller, getSellerArtProducts);
router.post('/', authenticate, requireSeller, upload.single('image'), createArtProduct);
router.delete('/:id', authenticate, requireSeller, deleteArtProduct);

// Public route - must be after more specific routes to avoid conflict
router.get('/:id', getArtProductById);

module.exports = router;
