const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  getAllProducts,
  getProductById,
  createProduct,
  deleteProduct,
  getSellerProducts,
  getProductsByAuthorSlug,
} = require('../controllers/productsController');
const { authenticate, requireSeller, requireArtistSeller } = require('../middleware/authorization');

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

// Public routes
router.get('/', getAllProducts);
router.get('/author/:slug', getProductsByAuthorSlug);

// Protected routes - Seller only
// Legacy products router; gated like art and others for the same reason.
router.get('/seller/me', authenticate, requireSeller, requireArtistSeller, getSellerProducts);
router.post('/', authenticate, requireSeller, requireArtistSeller, upload.single('image'), createProduct);
router.delete('/:id', authenticate, requireSeller, requireArtistSeller, deleteProduct);

// Public route - must be after more specific routes to avoid conflict
router.get('/:id', getProductById);

module.exports = router;
