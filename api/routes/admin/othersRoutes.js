const express = require('express')
const router = express.Router()
const { db } = require('../../config/database')
const logger = require('../../config/logger')

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
