const { db } = require('../config/database');
const { ApiError, ValidationError } = require('../middleware/errorHandler');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const config = require('../config/env');
const s3Service = require('../services/s3Service');
const { attachProductImages } = require('../utils/productImages');
const { artVatRegimeForRate } = require('../utils/vatRegime');
const { createBatch } = require('../utils/transaction');
const {
  validateCommonProductFields,
  validateArtType,
  validateImageFile,
  generateUniqueBasename,
} = require('../utils/productValidation');

// Admin full-edit of art/others products. Field validation is shared with the
// public create endpoints (utils/productValidation.js). Updates never touch
// slug (public URLs stay stable), status (no re-review for admin edits),
// visible or is_sold (they have dedicated admin actions).

const ART_UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'art');
const OTHERS_UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'others');

// Storage helpers. `prefix` is 'art' | 'others' (the storage folder), which
// also matches the S3 key prefix used by the create endpoints.
const storageDirFor = (prefix) => (prefix === 'art' ? ART_UPLOADS_DIR : OTHERS_UPLOADS_DIR);

const writeImageFile = async (prefix, basename, file) => {
  if (config.useS3) {
    await s3Service.uploadFile(`${prefix}/${basename}`, file.buffer, file.mimetype);
  } else {
    const dir = storageDirFor(prefix);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, basename), file.buffer);
  }
};

// Best-effort deletion: log failures, never throw (used after DB commit and
// during rollback cleanup).
const deleteImageFile = async (prefix, basename) => {
  if (config.useS3) {
    await s3Service.deleteFile(`${prefix}/${basename}`).catch((err) =>
      logger.error({ err, basename }, 'Failed to delete image file during product edit'),
    );
  } else {
    try {
      await fs.promises.unlink(path.join(storageDirFor(prefix), basename));
    } catch (err) {
      logger.error({ err, basename }, 'Failed to delete image file during product edit');
    }
  }
};

// Parse and structurally validate an image manifest: an ordered JSON array of
// { kind: 'existing', basename } | { kind: 'new' } entries describing the
// final image list. Returns { entries, errors }.
const parseImageManifest = (raw, fieldName) => {
  const errors = [];
  let entries = [];
  if (raw == null || raw === '') {
    return { entries, errors: [{ field: fieldName, message: 'Falta el manifiesto de imágenes' }] };
  }
  try {
    entries = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return { entries: [], errors: [{ field: fieldName, message: 'Manifiesto de imágenes inválido' }] };
  }
  if (!Array.isArray(entries)) {
    return { entries: [], errors: [{ field: fieldName, message: 'Manifiesto de imágenes inválido' }] };
  }
  for (const entry of entries) {
    if (!entry || (entry.kind !== 'existing' && entry.kind !== 'new')) {
      errors.push({ field: fieldName, message: 'Manifiesto de imágenes inválido' });
      break;
    }
    if (entry.kind === 'existing' && (typeof entry.basename !== 'string' || !entry.basename)) {
      errors.push({ field: fieldName, message: 'Manifiesto de imágenes inválido' });
      break;
    }
  }
  return { entries: errors.length > 0 ? [] : entries, errors };
};

// Validate a manifest against the uploaded files and the set of basenames the
// product currently owns. Returns { errors, keptBasenames, newCount }.
const checkManifest = ({ entries, files, ownedBasenames, fieldName, minImages, maxImages = 3 }) => {
  const errors = [];
  const keptBasenames = [];
  let newCount = 0;

  for (const entry of entries) {
    if (entry.kind === 'existing') {
      if (!ownedBasenames.has(entry.basename)) {
        errors.push({ field: fieldName, message: 'El manifiesto referencia una imagen que no pertenece a este producto' });
      } else {
        keptBasenames.push(entry.basename);
      }
    } else {
      newCount += 1;
    }
  }

  if (new Set(keptBasenames).size !== keptBasenames.length) {
    errors.push({ field: fieldName, message: 'El manifiesto contiene imágenes duplicadas' });
  }
  if (newCount !== files.length) {
    errors.push({ field: fieldName, message: 'El número de imágenes nuevas no coincide con el manifiesto' });
  }
  if (entries.length > maxImages) {
    errors.push({ field: fieldName, message: `Se permiten como máximo ${maxImages} imágenes` });
  }
  if (minImages > 0 && entries.length < minImages) {
    errors.push({ field: fieldName, message: 'El archivo de imagen es obligatorio' });
  }

  return { errors, keptBasenames, newCount };
};

// Build the final ordered image list for a manifest: existing entries keep
// their basename, new entries consume uploaded files (with fresh basenames)
// in order. Returns { finalEntries: [{basename, file|null}], newEntries }.
const buildFinalImageList = (entries, files) => {
  const finalEntries = [];
  const newEntries = [];
  let fileIdx = 0;
  for (const entry of entries) {
    if (entry.kind === 'existing') {
      finalEntries.push({ basename: entry.basename, file: null });
    } else {
      const file = files[fileIdx++];
      const basename = generateUniqueBasename(file.mimetype);
      const item = { basename, file };
      finalEntries.push(item);
      newEntries.push(item);
    }
  }
  return { finalEntries, newEntries };
};

const fetchOwnedBasenames = async (productType, productId) => {
  const result = await db.execute({
    sql: 'SELECT basename FROM product_images WHERE product_type = ? AND product_id = ?',
    args: [productType, productId],
  });
  return new Set(result.rows.map((r) => r.basename));
};

/**
 * GET /api/admin/products/:id/edit-data?type=art|others
 * Full product row with hydrated images (and variations with images for
 * others) plus the seller's commission rates, for the admin edit form.
 */
const getProductEditData = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const { type } = req.query;

    if (type !== 'art' && type !== 'others') {
      throw new ApiError(400, 'El parámetro "type" es obligatorio y debe ser "art" o "others"', 'Error de validación');
    }

    const table = type === 'art' ? 'art' : 'others';
    const result = await db.execute({
      sql: `SELECT * FROM ${table} WHERE id = ? AND removed = 0`,
      args: [productId],
    });

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Producto no encontrado', 'No encontrado');
    }

    const product = result.rows[0];

    // The packaging columns describe the box, not the artwork, and belong to
    // the art shipping calculator alone (`PATCH /api/admin/art-shipping/...`).
    // `SELECT *` would hand them to the edit form, where an input for them
    // would eventually appear and start writing a value the calculator froze
    // into a price. Dropped here rather than by enumerating every column of two
    // tables, which would break the form the day a column is added.
    delete product.outside_dimensions;
    delete product.outside_weight;
    delete product.packaging_cost;

    await attachProductImages([product], type === 'art' ? 'art' : 'other');

    if (type === 'others') {
      const variationsResult = await db.execute({
        sql: 'SELECT * FROM other_vars WHERE other_id = ? ORDER BY id ASC',
        args: [product.id],
      });
      await attachProductImages(variationsResult.rows, 'other_var');
      product.variations = variationsResult.rows;
    }

    const sellerResult = await db.execute({
      sql: `SELECT dealer_commission_art, dealer_commission_other,
                   tax_vat_art, tax_vat_other
            FROM users WHERE id = ?`,
      args: [product.seller_id],
    });
    const sellerRow = sellerResult.rows[0] || {};

    res.status(200).json({
      success: true,
      product,
      commissionRates: {
        art: Number(sellerRow.dealer_commission_art) || 0,
        other: Number(sellerRow.dealer_commission_other) || 0,
      },
      tax_rates: {
        art: Number(sellerRow.tax_vat_art) || 0,
        other: Number(sellerRow.tax_vat_other) || 0,
      },
      // Derived server-side so the client never re-implements the regime rule.
      artVatRegime: artVatRegimeForRate(sellerRow.tax_vat_art),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/art/:id
 * Full update of an art product: fields + image reconciliation against the
 * client-provided manifest. Multipart, same field structure as creation plus
 * `images_manifest`.
 */
const updateArtProduct = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const { name, description, price, type, weight, dimensions, for_auction, ai_generated } = req.body;

    const productResult = await db.execute({
      sql: 'SELECT * FROM art WHERE id = ? AND removed = 0',
      args: [productId],
    });
    if (productResult.rows.length === 0) {
      throw new ApiError(404, 'Producto no encontrado', 'No encontrado');
    }

    const validationErrors = [
      ...validateCommonProductFields({ name, description, price, weight, dimensions }, 'art'),
      ...validateArtType(type),
    ];

    const imageFiles = req.files?.['images'] || [];
    const { entries: manifestEntries, errors: manifestErrors } = parseImageManifest(req.body.images_manifest, 'images');
    validationErrors.push(...manifestErrors);

    const ownedBasenames = await fetchOwnedBasenames('art', productId);
    let keptBasenames = [];
    if (manifestErrors.length === 0) {
      const check = checkManifest({
        entries: manifestEntries,
        files: imageFiles,
        ownedBasenames,
        fieldName: 'images',
        minImages: 1,
      });
      validationErrors.push(...check.errors);
      keptBasenames = check.keptBasenames;
    }

    imageFiles.forEach((file, i) => {
      validationErrors.push(...validateImageFile(file, `images[${i}]`));
    });

    if (validationErrors.length > 0) {
      throw new ValidationError(validationErrors);
    }

    const { finalEntries, newEntries } = buildFinalImageList(manifestEntries, imageFiles);

    // Basenames present before but absent from the manifest → delete after commit
    const keptSet = new Set(keptBasenames);
    const removedBasenames = [...ownedBasenames].filter((b) => !keptSet.has(b));

    // Write new files first, then commit DB changes atomically
    const writtenBasenames = [];
    try {
      for (const entry of newEntries) {
        await writeImageFile('art', entry.basename, entry.file);
        writtenBasenames.push(entry.basename);
      }

      const weightValue = weight ? parseInt(weight, 10) : null;
      const dimensionsValue = dimensions && typeof dimensions === 'string' ? dimensions.trim() : null;
      const forAuctionVal = for_auction === '1' || for_auction === 1 ? 1 : 0;
      const aiGeneratedVal = ai_generated === '1' || ai_generated === 1 ? 1 : 0;

      const batch = createBatch();
      // edition_size is intentionally absent: the edition run is fixed at
      // creation and immutable (like slug and status).
      batch.add(
        `UPDATE art SET name = ?, description = ?, price = ?, type = ?, weight = ?, dimensions = ?, for_auction = ?, ai_generated = ? WHERE id = ?`,
        [name, description, parseFloat(price), type, weightValue, dimensionsValue, forAuctionVal, aiGeneratedVal, productId],
      );
      batch.add('DELETE FROM product_images WHERE product_type = ? AND product_id = ?', ['art', productId]);
      finalEntries.forEach((entry, i) => {
        batch.add(
          'INSERT INTO product_images (product_type, product_id, basename, position) VALUES (?, ?, ?, ?)',
          ['art', productId, entry.basename, i],
        );
      });
      await batch.execute();
    } catch (dbError) {
      for (const basename of writtenBasenames) {
        await deleteImageFile('art', basename);
      }
      throw dbError;
    }

    // DB committed — remove storage files for images no longer referenced
    for (const basename of removedBasenames) {
      await deleteImageFile('art', basename);
    }

    const updatedResult = await db.execute({
      sql: 'SELECT * FROM art WHERE id = ?',
      args: [productId],
    });
    const product = updatedResult.rows[0];
    await attachProductImages([product], 'art');

    res.status(200).json({ success: true, product });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/others/:id
 * Full update of an others product: fields, global images, and variation
 * reconciliation by id (update / insert / delete, each with its own image
 * manifest under `variation_<idx>_images_manifest`).
 */
const updateOthersProduct = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const { name, description, price, variations, weight, dimensions, for_auction, ai_generated, can_copack } = req.body;

    const productResult = await db.execute({
      sql: 'SELECT * FROM others WHERE id = ? AND removed = 0',
      args: [productId],
    });
    if (productResult.rows.length === 0) {
      throw new ApiError(404, 'Producto no encontrado', 'No encontrado');
    }

    const validationErrors = validateCommonProductFields(
      { name, description, price, weight, dimensions },
      'other',
    );

    // Validate variations payload (same rules as creation, plus optional id)
    let parsedVariations = [];
    if (variations) {
      try {
        parsedVariations = typeof variations === 'string' ? JSON.parse(variations) : variations;
        if (!Array.isArray(parsedVariations) || parsedVariations.length === 0) {
          validationErrors.push({ field: 'variations', message: 'Debe proporcionar al menos una variación o stock global' });
          parsedVariations = [];
        } else {
          parsedVariations.forEach((v, index) => {
            if (v.key !== null && (!v.key || typeof v.key !== 'string')) {
              validationErrors.push({ field: `variations[${index}].key`, message: 'La clave de variación debe ser una cadena válida' });
            }
            const stock = parseInt(v.stock, 10);
            if (!Number.isInteger(stock) || stock < 0) {
              validationErrors.push({ field: `variations[${index}].stock`, message: 'El stock debe ser un número entero positivo o cero' });
            }
          });
        }
      } catch (e) {
        validationErrors.push({ field: 'variations', message: 'Formato de variaciones inválido' });
        parsedVariations = [];
      }
    } else {
      validationErrors.push({ field: 'variations', message: 'Debe proporcionar variaciones o stock global' });
    }

    // Existing variations for reconciliation; payload ids must belong to this product
    const existingVarsResult = await db.execute({
      sql: 'SELECT id FROM other_vars WHERE other_id = ?',
      args: [productId],
    });
    const existingVarIds = new Set(existingVarsResult.rows.map((r) => r.id));
    parsedVariations.forEach((v, index) => {
      if (v.id != null && !existingVarIds.has(Number(v.id))) {
        validationErrors.push({ field: `variations[${index}].id`, message: 'La variación no pertenece a este producto' });
      }
    });

    const hasNamedVariations = parsedVariations.some(
      (v) => v.key != null && String(v.key).trim() !== '',
    );

    // Global images: manifest + files (min 1 only when no named variations)
    const globalImageFiles = req.files?.['images'] || [];
    const { entries: globalManifest, errors: globalManifestErrors } = parseImageManifest(req.body.images_manifest, 'images');
    validationErrors.push(...globalManifestErrors);

    const ownedGlobalBasenames = await fetchOwnedBasenames('other', productId);
    if (globalManifestErrors.length === 0) {
      const check = checkManifest({
        entries: globalManifest,
        files: globalImageFiles,
        ownedBasenames: ownedGlobalBasenames,
        fieldName: 'images',
        minImages: hasNamedVariations ? 0 : 1,
      });
      validationErrors.push(...check.errors);
    }
    globalImageFiles.forEach((file, i) => {
      validationErrors.push(...validateImageFile(file, `images[${i}]`));
    });

    // Per-variation images: manifest + files per index. Existing basenames
    // must belong to that specific variation (new variations own none yet).
    const variationImageData = [];
    for (let i = 0; i < parsedVariations.length; i++) {
      const v = parsedVariations[i];
      const files = req.files?.[`variation_${i}_images`] || [];
      const fieldName = `variation_${i}_images`;
      const { entries, errors } = parseImageManifest(
        req.body[`variation_${i}_images_manifest`] ?? '[]',
        fieldName,
      );
      validationErrors.push(...errors);

      const isNamed = v.key != null && String(v.key).trim() !== '';
      let ownedBasenames = new Set();
      if (v.id != null && existingVarIds.has(Number(v.id))) {
        ownedBasenames = await fetchOwnedBasenames('other_var', Number(v.id));
      }
      if (errors.length === 0) {
        const check = checkManifest({
          entries,
          files,
          ownedBasenames,
          fieldName,
          minImages: hasNamedVariations && isNamed ? 1 : 0,
        });
        // Match the creation error message for a named variation without images
        validationErrors.push(...check.errors.map((err) => {
          if (err.message === 'El archivo de imagen es obligatorio') {
            const label = String(v.key ?? '').trim() || String(i + 1);
            return { field: `${fieldName}[0]`, message: `La variación ${label} debe tener al menos una imagen` };
          }
          return err;
        }));
      }
      files.forEach((file, slotIdx) => {
        validationErrors.push(...validateImageFile(file, `${fieldName}[${slotIdx}]`));
      });
      variationImageData.push({ entries, files, ownedBasenames });
    }

    if (validationErrors.length > 0) {
      throw new ValidationError(validationErrors);
    }

    // Build final image lists (existing kept + new uploads with fresh basenames)
    const globalImages = buildFinalImageList(globalManifest, globalImageFiles);
    const variationImages = variationImageData.map(({ entries, files }) =>
      buildFinalImageList(entries, files),
    );

    // Variations to delete: existing ids absent from the payload
    const payloadVarIds = new Set(
      parsedVariations.filter((v) => v.id != null).map((v) => Number(v.id)),
    );
    const deletedVarIds = [...existingVarIds].filter((id) => !payloadVarIds.has(id));

    // Storage files to remove after commit: unreferenced global images,
    // unreferenced images of surviving variations, and every image of
    // deleted variations.
    const removedBasenames = [];
    {
      const keptGlobal = new Set(globalManifest.filter((e) => e.kind === 'existing').map((e) => e.basename));
      for (const b of ownedGlobalBasenames) {
        if (!keptGlobal.has(b)) removedBasenames.push(b);
      }
      variationImageData.forEach(({ entries, ownedBasenames }) => {
        const kept = new Set(entries.filter((e) => e.kind === 'existing').map((e) => e.basename));
        for (const b of ownedBasenames) {
          if (!kept.has(b)) removedBasenames.push(b);
        }
      });
      for (const varId of deletedVarIds) {
        const owned = await fetchOwnedBasenames('other_var', varId);
        removedBasenames.push(...owned);
      }
    }

    // Write new files first; on any later DB failure they are cleaned up
    const writtenBasenames = [];
    try {
      for (const entry of globalImages.newEntries) {
        await writeImageFile('others', entry.basename, entry.file);
        writtenBasenames.push(entry.basename);
      }
      for (const { newEntries } of variationImages) {
        for (const entry of newEntries) {
          await writeImageFile('others', entry.basename, entry.file);
          writtenBasenames.push(entry.basename);
        }
      }

      const weightValue = weight ? parseInt(weight, 10) : null;
      const dimensionsValue = dimensions && typeof dimensions === 'string' ? dimensions.trim() : null;
      const forAuctionVal = for_auction === '1' || for_auction === 1 ? 1 : 0;
      const aiGeneratedVal = ai_generated === '1' || ai_generated === 1 ? 1 : 0;
      const canCopackVal = can_copack === '0' || can_copack === 0 || can_copack === false ? 0 : 1;

      // Update product fields (slug/status/visible untouched)
      await db.execute({
        sql: `UPDATE others SET name = ?, description = ?, price = ?, weight = ?, dimensions = ?, for_auction = ?, ai_generated = ?, can_copack = ? WHERE id = ?`,
        args: [name, description, parseFloat(price), weightValue, dimensionsValue, forAuctionVal, aiGeneratedVal, canCopackVal, productId],
      });

      // Reconcile variations: update existing, insert new (one-by-one to
      // capture ids, mirroring the create flow), delete the removed ones.
      const finalVarIds = [];
      for (let i = 0; i < parsedVariations.length; i++) {
        const v = parsedVariations[i];
        if (v.id != null) {
          await db.execute({
            sql: 'UPDATE other_vars SET key = ?, stock = ? WHERE id = ?',
            args: [v.key || null, parseInt(v.stock, 10), Number(v.id)],
          });
          finalVarIds.push(Number(v.id));
        } else {
          const varInsert = await db.execute({
            sql: 'INSERT INTO other_vars (other_id, key, stock) VALUES (?, ?, ?)',
            args: [productId, v.key || null, parseInt(v.stock, 10)],
          });
          finalVarIds.push(Number(varInsert.lastInsertRowid));
        }
      }

      // Rewrite image rows: globals + per-variation, plus rows of deleted variations
      const batch = createBatch();
      batch.add('DELETE FROM product_images WHERE product_type = ? AND product_id = ?', ['other', productId]);
      globalImages.finalEntries.forEach((entry, i) => {
        batch.add(
          'INSERT INTO product_images (product_type, product_id, basename, position) VALUES (?, ?, ?, ?)',
          ['other', productId, entry.basename, i],
        );
      });
      finalVarIds.forEach((varId, varIdx) => {
        batch.add('DELETE FROM product_images WHERE product_type = ? AND product_id = ?', ['other_var', varId]);
        variationImages[varIdx].finalEntries.forEach((entry, slotIdx) => {
          batch.add(
            'INSERT INTO product_images (product_type, product_id, basename, position) VALUES (?, ?, ?, ?)',
            ['other_var', varId, entry.basename, slotIdx],
          );
        });
      });
      deletedVarIds.forEach((varId) => {
        batch.add('DELETE FROM product_images WHERE product_type = ? AND product_id = ?', ['other_var', varId]);
        batch.add('DELETE FROM other_vars WHERE id = ?', [varId]);
      });
      await batch.execute();
    } catch (dbError) {
      for (const basename of writtenBasenames) {
        await deleteImageFile('others', basename);
      }
      throw dbError;
    }

    // DB committed — remove storage files for images no longer referenced
    for (const basename of removedBasenames) {
      await deleteImageFile('others', basename);
    }

    const updatedResult = await db.execute({
      sql: 'SELECT * FROM others WHERE id = ?',
      args: [productId],
    });
    const product = updatedResult.rows[0];
    await attachProductImages([product], 'other');

    const variationsResult = await db.execute({
      sql: 'SELECT * FROM other_vars WHERE other_id = ? ORDER BY id ASC',
      args: [productId],
    });
    await attachProductImages(variationsResult.rows, 'other_var');
    product.variations = variationsResult.rows;

    res.status(200).json({ success: true, product });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProductEditData,
  updateArtProduct,
  updateOthersProduct,
};
