const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  getAllOthersProducts,
  getOthersProductById,
  createOthersProduct,
  deleteOthersProduct,
  getSellerOthersProducts,
  getOthersProductImage,
  getOthersProductsByAuthorSlug,
} = require('../controllers/othersController');
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
router.get('/', cacheControl({ maxAge: 60 }), getAllOthersProducts);
router.get('/images/:basename', cacheControl({ maxAge: 86400 }), getOthersProductImage);
router.get('/author/:slug', cacheControl({ maxAge: 120 }), getOthersProductsByAuthorSlug);

// Multer fields: 3 global product images + up to 20 variations × 3 images each.
// Indexed field names let multer partition files by variation without depending on
// body-parsing order.
const MAX_VARIATIONS = 20;
const MAX_IMAGES_PER_GROUP = 3;
const othersUploadFields = [
  { name: 'images', maxCount: MAX_IMAGES_PER_GROUP },
];
for (let i = 0; i < MAX_VARIATIONS; i++) {
  othersUploadFields.push({ name: `variation_${i}_images`, maxCount: MAX_IMAGES_PER_GROUP });
}

// Protected routes - Seller only
router.get('/seller/me', authenticate, requireSeller, getSellerOthersProducts);
router.post('/', authenticate, requireSeller, upload.fields(othersUploadFields), createOthersProduct);
router.delete('/:id', authenticate, requireSeller, deleteOthersProduct);

// Public route - must be after more specific routes to avoid conflict
router.get('/:id', getOthersProductById);

module.exports = router;
