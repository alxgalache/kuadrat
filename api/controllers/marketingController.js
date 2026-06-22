/**
 * Admin marketing controller — backs the "Marketing" admin section.
 *  - listAuthorsForAnnounce: visible authors (sellers) for the picker, annotated
 *    with whether they have already been announced.
 *  - announceAuthor: manually trigger the new-author broadcast.
 *  - listMarketingSends: paginated audit history of marketing_sends.
 */
const { db } = require('../config/database');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const { sendSuccess, sendPaginated } = require('../utils/response');
const marketingEmailService = require('../services/marketingEmailService');

/**
 * GET /api/admin/marketing/authors
 * Visible authors (role='seller', visible=1) for the announce picker.
 */
const listAuthorsForAnnounce = async (req, res, next) => {
  try {
    const result = await db.execute({
      sql: `SELECT u.id, u.full_name, u.slug, u.profile_img, u.location,
                   (SELECT COUNT(*) FROM marketing_sends m
                    WHERE m.kind = 'new_author' AND m.entity_id = CAST(u.id AS TEXT) AND m.status = 'sent') AS announced_count
            FROM users u
            WHERE u.role = 'seller' AND u.visible = 1
            ORDER BY u.full_name ASC`,
    });
    const authors = result.rows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      slug: r.slug,
      profile_img: r.profile_img,
      location: r.location,
      already_announced: Number(r.announced_count) > 0,
    }));
    return sendSuccess(res, { authors });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/marketing/announce-author
 * Body: { authorId }. Validates the author is a visible seller, then sends.
 */
const announceAuthor = async (req, res, next) => {
  try {
    const { authorId } = req.body;

    const result = await db.execute({
      sql: `SELECT id, full_name, slug, profile_img, location, bio
            FROM users WHERE id = ? AND role = 'seller' AND visible = 1`,
      args: [authorId],
    });
    const author = result.rows[0];
    if (!author) {
      throw new ApiError(404, 'Autor no encontrado', 'Autor no encontrado', null);
    }

    const sendResult = await marketingEmailService.sendNewAuthorAnnouncement(author);

    if (sendResult.skipped) {
      // Circuit breaker off / no key — report clearly rather than implying a send.
      return sendSuccess(res, { sent: false, skipped: true }, 200,
        'El marketing está desactivado en este entorno; no se ha enviado nada.');
    }

    logger.info({ authorId, broadcastId: sendResult.broadcastId }, 'New-author announcement sent by admin');
    return sendSuccess(res, { sent: true, broadcastId: sendResult.broadcastId }, 200, 'Anuncio enviado correctamente');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/marketing/sends?page=&limit=
 * Paginated audit history of marketing broadcasts.
 */
const listMarketingSends = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const countResult = await db.execute({ sql: 'SELECT COUNT(*) AS total FROM marketing_sends' });
    const total = Number(countResult.rows[0]?.total || 0);

    const result = await db.execute({
      sql: `SELECT id, kind, entity_id, topic_id, resend_broadcast_id, status, subject, error, created_at
            FROM marketing_sends
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?`,
      args: [limit, offset],
    });

    return sendPaginated(res, { sends: result.rows }, {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { listAuthorsForAnnounce, announceAuthor, listMarketingSends };
