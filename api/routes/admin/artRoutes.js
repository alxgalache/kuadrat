const express = require('express');
const multer = require('multer');
const router = express.Router();
const { updateArtProduct } = require('../../controllers/adminProductEditController');

// Multer configuration matching the public art create route (memory storage,
// PNG/JPG/WEBP up to 10MB, up to 3 images under the `images` field)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PNG, JPG, and WEBP images are allowed'));
  },
});

/**
 * PUT /api/admin/art/:id
 * Full update of an art product (fields + image manifest reconciliation)
 */
router.put('/:id', upload.fields([{ name: 'images', maxCount: 3 }]), updateArtProduct);

module.exports = router;
