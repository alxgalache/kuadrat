const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const { sendSuccess, sendPaginated } = require('../utils/response');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_EVENTS_LIMIT = 50;
const MAX_EVENTS_LIMIT = 500;

function isoTimestamp(date = new Date()) {
  // SQLite default DATETIME format: 'YYYY-MM-DD HH:MM:SS' (UTC).
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * GET /api/admin/coa/tags?page=&limit=&status=&art_id=
 */
const listTags = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || DEFAULT_PAGE, 1);
    const requestedLimit = parseInt(req.query.limit, 10) || DEFAULT_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
    const offset = (page - 1) * limit;

    const filters = [];
    const args = [];
    if (req.query.status) {
      filters.push('t.status = ?');
      args.push(req.query.status);
    }
    if (req.query.art_id !== undefined && req.query.art_id !== '') {
      filters.push('t.art_id = ?');
      args.push(Number(req.query.art_id));
    }
    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) AS total FROM nfc_tags t ${whereSql}`,
      args,
    });
    const total = Number(countResult.rows[0].total) || 0;
    const pages = Math.max(Math.ceil(total / limit), 1);

    const listResult = await db.execute({
      sql: `SELECT
              t.uid,
              t.serial_label,
              t.art_id,
              a.name AS art_name,
              a.slug AS art_slug,
              t.status,
              t.last_counter,
              t.is_permanently_locked,
              t.personalized_at,
              t.personalized_by,
              t.locked_at,
              t.notes
            FROM nfc_tags t
            LEFT JOIN art a ON a.id = t.art_id
            ${whereSql}
            ORDER BY t.personalized_at DESC
            LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    return sendPaginated(
      res,
      { tags: listResult.rows },
      { page, pages, total, limit },
    );
  } catch (err) {
    logger.error({ err }, 'Failed to list NFC tags');
    return next(new ApiError(500, 'Error al listar las pegatinas NFC'));
  }
};

/**
 * GET /api/admin/coa/tags/:uid?events_limit=
 */
const getTagDetail = async (req, res, next) => {
  const uid = req.params.uid.toUpperCase();
  try {
    const tagQuery = await db.execute({
      sql: `SELECT
              t.uid,
              t.serial_label,
              t.art_id,
              a.name AS art_name,
              a.slug AS art_slug,
              (SELECT basename FROM product_images WHERE product_type = 'art' AND product_id = a.id ORDER BY position ASC, id ASC LIMIT 1) AS art_basename,
              t.status,
              t.last_counter,
              t.is_permanently_locked,
              t.personalized_at,
              t.personalized_by,
              t.locked_at,
              t.notes
            FROM nfc_tags t
            LEFT JOIN art a ON a.id = t.art_id
            WHERE t.uid = ?
            LIMIT 1`,
      args: [uid],
    });
    const tag = tagQuery.rows[0];
    if (!tag) {
      throw new ApiError(404, 'Pegatina NFC no encontrada');
    }

    const requestedEventsLimit = parseInt(req.query.events_limit, 10) || DEFAULT_EVENTS_LIMIT;
    const eventsLimit = Math.min(Math.max(requestedEventsLimit, 1), MAX_EVENTS_LIMIT);

    const eventsQuery = await db.execute({
      sql: `SELECT id, uid, counter, status, ip_hash, user_agent, occurred_at
            FROM verification_events
            WHERE uid = ?
            ORDER BY occurred_at DESC
            LIMIT ?`,
      args: [uid, eventsLimit],
    });

    return sendSuccess(res, { tag, events: eventsQuery.rows });
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    logger.error({ err, uid }, 'Failed to get NFC tag detail');
    return next(new ApiError(500, 'Error al obtener el detalle de la pegatina NFC'));
  }
};

/**
 * PATCH /api/admin/coa/tags/:uid/status
 * Body: { status: 'active'|'revoked'|'lost'|'damaged', notes?: string }
 *
 * Idempotent: setting the status to its current value succeeds without
 * inserting a new notes entry.
 */
const updateTagStatus = async (req, res, next) => {
  const uid = req.params.uid.toUpperCase();
  const { status: newStatus, notes: newNotes } = req.body;
  const adminId = req.user ? req.user.id : null;

  try {
    const currentQuery = await db.execute({
      sql: `SELECT uid, status, notes FROM nfc_tags WHERE uid = ? LIMIT 1`,
      args: [uid],
    });
    const current = currentQuery.rows[0];
    if (!current) {
      throw new ApiError(404, 'Pegatina NFC no encontrada');
    }

    const statusChanged = current.status !== newStatus;
    let updatedNotes = current.notes;
    if (newNotes && newNotes.length > 0) {
      const stamp = `[${isoTimestamp()}] ${newNotes}`;
      updatedNotes = current.notes ? `${current.notes}\n${stamp}` : stamp;
    }

    if (statusChanged || updatedNotes !== current.notes) {
      await db.execute({
        sql: `UPDATE nfc_tags SET status = ?, notes = ? WHERE uid = ?`,
        args: [newStatus, updatedNotes, uid],
      });
    }

    if (statusChanged) {
      logger.info(
        { adminId, uid, fromStatus: current.status, toStatus: newStatus, reason: newNotes || null },
        'NFC tag status changed',
      );
    }

    const updatedQuery = await db.execute({
      sql: `SELECT uid, serial_label, art_id, status, last_counter,
                   is_permanently_locked, personalized_at, personalized_by,
                   locked_at, notes
            FROM nfc_tags
            WHERE uid = ?
            LIMIT 1`,
      args: [uid],
    });

    return sendSuccess(res, { tag: updatedQuery.rows[0] });
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    logger.error({ err, uid }, 'Failed to update NFC tag status');
    return next(new ApiError(500, 'Error al actualizar el estado de la pegatina NFC'));
  }
};

module.exports = {
  listTags,
  getTagDetail,
  updateTagStatus,
};
