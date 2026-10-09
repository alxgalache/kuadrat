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
const { authenticate, requireSeller, requireArtistSeller } = require('../middleware/authorization');
const { cacheControl } = require('../middleware/cache');
const { getCatalogJpegImage } = require('../controllers/catalogImageController');
const { CATALOG_JPEG_VERSION } = require('../utils/productImageUrl');

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
// Square JPEG copy for the Meta catalogue, which rejects WebP. It sets its own
// immutable Cache-Control, on success only. See services/catalogImageService.js.
router.get(`/images/jpeg/${CATALOG_JPEG_VERSION}/:file`, getCatalogJpegImage('others'));
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
// requireArtistSeller: a speaker publishes no store product either.
router.get('/seller/me', authenticate, requireSeller, requireArtistSeller, getSellerOthersProducts);
router.post('/', authenticate, requireSeller, requireArtistSeller, upload.fields(othersUploadFields), createOthersProduct);
router.delete('/:id', authenticate, requireSeller, requireArtistSeller, deleteOthersProduct);

// Public route - must be after more specific routes to avoid conflict
router.get('/:id', getOthersProductById);

module.exports = router;
