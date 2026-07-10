const express = require('express')
const multer = require('multer')
const router = express.Router()
const { db } = require('../../config/database')
const logger = require('../../config/logger')
const { updateOthersProduct } = require('../../controllers/adminProductEditController')

// Multer configuration matching the public others create route: 3 global
// product images + up to 20 variations × 3 images each (memory storage,
// PNG/JPG/WEBP up to 10MB).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PNG, JPG, and WEBP images are allowed'));
  },
});

const MAX_VARIATIONS = 20;
const MAX_IMAGES_PER_GROUP = 3;
const othersUploadFields = [
  { name: 'images', maxCount: MAX_IMAGES_PER_GROUP },
];
for (let i = 0; i < MAX_VARIATIONS; i++) {
  othersUploadFields.push({ name: `variation_${i}_images`, maxCount: MAX_IMAGES_PER_GROUP });
}

/**
 * PUT /api/admin/others/:id
 * Full update of an others product (fields + global/variation image manifests
 * + variation reconciliation by id)
 */
router.put('/:id', upload.fields(othersUploadFields), updateOthersProduct);

/**
 * PUT /api/admin/others/:id/variations
 * Update variations for an 'others' product - admin version (no ownership check)
 */
router.put('/:id/variations', async (req, res) => {
  try {
    const productId = req.params.id;
    const { variations } = req.body;

    const productCheck = await db.execute({
      sql: 'SELECT id FROM others WHERE id = ? AND removed = 0',
      args: [productId]
    });

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Producto no encontrado'
      });
    }

    const existingVars = await db.execute({
      sql: 'SELECT id FROM other_vars WHERE other_id = ?',
      args: [productId]
    });
    const existingVarIds = existingVars.rows.map(v => v.id);
    const variationIds = [];

    for (const variation of variations) {
      if (variation.id && existingVarIds.includes(variation.id)) {
        await db.execute({
          sql: 'UPDATE other_vars SET key = ?, value = ?, stock = ? WHERE id = ?',
          args: [variation.key || '', variation.value || '', variation.stock || 0, variation.id]
        });
        variationIds.push(variation.id);
      } else {
        const result = await db.execute({
          sql: 'INSERT INTO other_vars (other_id, key, value, stock) VALUES (?, ?, ?, ?)',
          args: [productId, variation.key || '', variation.value || '', variation.stock || 0]
        });
        variationIds.push(result.lastInsertRowid);
      }
    }

    const varsToDelete = existingVarIds.filter(id => !variationIds.includes(id));
    for (const varId of varsToDelete) {
      await db.execute({
        sql: 'DELETE FROM other_vars WHERE id = ?',
        args: [varId]
      });
    }

    res.json({
      title: 'Actualizado',
      message: 'Variaciones actualizadas correctamente'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating variations');
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudieron actualizar las variaciones'
    });
  }
});

module.exports = router
