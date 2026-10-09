const { db } = require('../config/database');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const { getCatalogJpeg } = require('../services/catalogImageService');

// The pattern the existing image routes accept.
const BASENAME_RE = /^[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp)$/;

// Which product images live under each route prefix. Variant images are
// stored under `others/`, like the product's own.
const PRODUCT_TYPES_BY_PREFIX = {
  art: ['art'],
  others: ['other', 'other_var'],
};

/**
 * GET /api/{art,others}/images/jpeg/v1/:basename.jpg
 *
 * Square JPEG copy of a product image (services/catalogImageService.js). Only
 * an image that exists in `product_images` under this prefix is converted: the
 * route is public and must not become a converter for any file someone names.
 * Only a successful copy is marked immutable; nginx keeps a 404 for a minute.
 *
 * @param {'art'|'others'} prefix
 */
function getCatalogJpegImage(prefix) {
  const productTypes = PRODUCT_TYPES_BY_PREFIX[prefix];

  return async (req, res, next) => {
    try {
      // `<basename>.jpg`: the copy of `<basename>`, named for what it serves.
      const { file } = req.params;
      const basename = file.endsWith('.jpg') ? file.slice(0, -'.jpg'.length) : '';
      if (!BASENAME_RE.test(basename)) {
        throw new ApiError(400, 'Nombre de imagen inválido', 'INVALID_IMAGE_NAME');
      }

      const found = await db.execute({
        sql: `SELECT product_type FROM product_images
              WHERE basename = ? AND product_type IN (${productTypes.map(() => '?').join(',')})
              LIMIT 1`,
        args: [basename, ...productTypes],
      });
      if (found.rows.length === 0) {
        throw new ApiError(404, 'Imagen no encontrada', 'IMAGE_NOT_FOUND');
      }
      const productType = found.rows[0].product_type;

      let jpeg;
      try {
        jpeg = await getCatalogJpeg(basename, productType);
      } catch (err) {
        logger.error({ err, basename, productType }, 'Catalog JPEG copy failed');
        throw new ApiError(502, 'No se pudo generar la imagen', 'IMAGE_CONVERSION_FAILED');
      }

      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.status(200).send(jpeg);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { getCatalogJpegImage };
