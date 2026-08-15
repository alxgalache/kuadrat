const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const { sendSuccess, sendPaginated } = require('../utils/response');
const artShippingCalculator = require('../services/shipping/artShippingCalculator');

/**
 * Admin endpoints for the art shipping calculator.
 *
 * Everything here sits behind `authenticate` + `adminAuth`, applied once in
 * routes/admin/index.js.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/admin/art-shipping/products?title=&author=&page=&limit=
 *
 * The list of artworks with their packaging fields. Filtering happens in SQL
 * rather than in the browser: the catalog grows, and a client-side filter would
 * quietly stop finding things once it outgrows one page.
 */
const listArtProducts = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || DEFAULT_PAGE, 1);
    const requestedLimit = parseInt(req.query.limit, 10) || DEFAULT_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
    const offset = (page - 1) * limit;

    const filters = ['a.removed = 0'];
    const args = [];

    const title = (req.query.title || '').trim();
    if (title) {
      filters.push('a.name LIKE ?');
      args.push(`%${title}%`);
    }

    const author = (req.query.author || '').trim();
    if (author) {
      filters.push('u.full_name LIKE ?');
      args.push(`%${author}%`);
    }

    const whereSql = `WHERE ${filters.join(' AND ')}`;

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) AS total
              FROM art a
              JOIN users u ON u.id = a.seller_id
              ${whereSql}`,
      args,
    });
    const total = Number(countResult.rows[0].total) || 0;
    const pages = Math.max(Math.ceil(total / limit), 1);

    const listResult = await db.execute({
      sql: `SELECT
              a.id,
              a.name,
              a.price,
              a.dimensions,
              a.weight,
              a.outside_dimensions,
              a.outside_weight,
              a.packaging_cost,
              a.seller_id,
              u.full_name AS author_name,
              (SELECT MAX(calculated_at) FROM shipping_zones sz
                WHERE sz.product_id = a.id AND sz.product_type = 'art'
                  AND sz.source = 'sendcloud_calculator') AS calculated_at,
              (SELECT COUNT(*) FROM shipping_zones sz
                WHERE sz.product_id = a.id AND sz.product_type = 'art'
                  AND sz.source = 'sendcloud_calculator') AS generated_zones
            FROM art a
            JOIN users u ON u.id = a.seller_id
            ${whereSql}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    return sendPaginated(res, { products: listResult.rows }, { page, pages, total, limit });
  } catch (err) {
    return next(err);
  }
};

/**
 * Write the three packaging columns of an artwork. Returns the artwork id, or
 * throws 404 when it does not exist.
 */
async function persistPackaging(artId, body) {
  const assignments = [];
  const args = [];

  if (body.outside_dimensions !== undefined) {
    assignments.push('outside_dimensions = ?');
    args.push(body.outside_dimensions || null);
  }
  if (body.outside_weight !== undefined) {
    assignments.push('outside_weight = ?');
    args.push(body.outside_weight === null ? null : Number(body.outside_weight));
  }
  if (body.packaging_cost !== undefined) {
    assignments.push('packaging_cost = ?');
    args.push(Number(body.packaging_cost));
  }

  if (assignments.length === 0) return;

  const result = await db.execute({
    sql: `UPDATE art SET ${assignments.join(', ')} WHERE id = ?`,
    args: [...args, artId],
  });

  if (result.rowsAffected === 0) {
    throw new ApiError(404, 'Obra no encontrada', 'Obra no encontrada');
  }
}

/**
 * PATCH /api/admin/art-shipping/:artId/packaging
 *
 * Saves the packaging fields without quoting. The only writer of these three
 * columns besides the quote endpoint — they are deliberately absent from the
 * product creation and edit forms.
 */
const savePackaging = async (req, res, next) => {
  try {
    const artId = Number(req.params.artId);
    await persistPackaging(artId, req.body);

    const result = await db.execute({
      sql: 'SELECT id, outside_dimensions, outside_weight, packaging_cost FROM art WHERE id = ?',
      args: [artId],
    });

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Obra no encontrada', 'Obra no encontrada');
    }

    return sendSuccess(res, { product: result.rows[0] }, 200, 'Datos de embalaje guardados');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/admin/art-shipping/:artId/quote
 *
 * Persists the packaging fields and then quotes the four Spanish zone groups.
 *
 * The write happens BEFORE the Sendcloud call on purpose: a provider failure
 * must not cost the admin the values they just typed. The quote can be retried;
 * re-typing three fields for every artwork cannot.
 */
const saveAndQuote = async (req, res, next) => {
  try {
    const artId = Number(req.params.artId);

    await persistPackaging(artId, req.body);

    const quote = await artShippingCalculator.quoteArtwork({ artId });

    return sendSuccess(res, quote);
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/admin/art-shipping/:artId/zones
 *
 * Replaces the generated zones of one zone group with the selection the screen
 * is showing. Set semantics: an empty `selections` array clears the territory.
 */
const applyZoneSelection = async (req, res, next) => {
  try {
    const artId = Number(req.params.artId);
    const { zone_group: zoneGroup, selections } = req.body;

    const result = await artShippingCalculator.applyZoneSelection({
      artId,
      zoneGroup,
      selections: (selections || []).map((s) => ({
        optionCode: s.option_code,
        name: s.name || s.option_code,
        carrierCode: s.carrier_code || null,
        baseCost: Number(s.base_cost),
        estimatedDays: s.estimated_days === undefined || s.estimated_days === null
          ? null
          : Number(s.estimated_days),
      })),
    });

    logger.info(
      { artId, zoneGroup, selected: result.zones.length, adminId: req.user?.id },
      'Admin saved art shipping zones from the calculator'
    );

    return sendSuccess(res, result, 200, 'Zonas de envío guardadas');
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listArtProducts,
  savePackaging,
  saveAndQuote,
  applyZoneSelection,
};
