const { db } = require('../config/database');
const { randomUUID, createHash, randomBytes } = require('crypto');
const slugify = require('slugify');
const logger = require('../config/logger');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID() {
  return randomUUID();
}

function generateAccessToken() {
  return randomBytes(32).toString('hex');
}

function hashAccessToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a 6-char alphanumeric event password (excludes ambiguous chars: 0OI1L).
 */
function generateEventPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function generateOTPCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateSlug(title) {
  return slugify(title, { lower: true, strict: true }) + '-' + randomBytes(4).toString('hex');
}

// ---------------------------------------------------------------------------
// Event CRUD
// ---------------------------------------------------------------------------

async function createEvent({
  title, description, event_datetime, duration_minutes, host_user_id,
  cover_image_url, access_type, price, currency, format, content_type,
  category, video_url, max_attendees, status,
}) {
  const id = generateUUID();
  const slug = generateSlug(title);

  await db.execute({
    sql: `INSERT INTO events (id, title, slug, description, event_datetime, duration_minutes,
          host_user_id, cover_image_url, access_type, price, currency, format, content_type,
          category, video_url, max_attendees, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, title, slug, description || null, event_datetime, duration_minutes || 60,
      host_user_id, cover_image_url || null, access_type || 'free',
      price || null, currency || 'EUR', format || 'live', content_type || 'streaming',
      category, video_url || null, max_attendees || null, status || 'draft',
    ],
  });

  return getEventById(id);
}

async function updateEvent(id, fields) {
  const current = await getEventById(id);
  if (!current) return null;

  const allowedFields = [
    'title', 'description', 'event_datetime', 'duration_minutes', 'host_user_id',
    'cover_image_url', 'access_type', 'price', 'currency', 'format', 'content_type',
    'category', 'video_url', 'max_attendees', 'status',
  ];

  const setClauses = [];
  const args = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key) && value !== undefined) {
      setClauses.push(`${key} = ?`);
      args.push(value);
    }
  }

  // Regenerate slug if title changed
  if (fields.title && fields.title !== current.title) {
    setClauses.push('slug = ?');
    args.push(generateSlug(fields.title));
  }

  if (setClauses.length === 0) return current;

  args.push(id);
  await db.execute({
    sql: `UPDATE events SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });

  return getEventById(id);
}

async function deleteEvent(id) {
  const current = await getEventById(id);
  if (!current) return false;
  if (!['draft', 'cancelled'].includes(current.status)) return false;

  await db.execute({ sql: 'DELETE FROM event_attendees WHERE event_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM events WHERE id = ?', args: [id] });
  return true;
}

async function getEventById(id) {
  const result = await db.execute({
    sql: `SELECT e.*, u.full_name as host_name, u.slug as host_slug, u.profile_img as host_profile_img
          FROM events e
          LEFT JOIN users u ON e.host_user_id = u.id
          WHERE e.id = ?`,
    args: [id],
  });
  return result.rows[0] || null;
}

async function getEventBySlug(slug) {
  const result = await db.execute({
    sql: `SELECT e.*, u.full_name as host_name, u.slug as host_slug, u.profile_img as host_profile_img
          FROM events e
          LEFT JOIN users u ON e.host_user_id = u.id
          WHERE e.slug = ?`,
    args: [slug],
  });
  return result.rows[0] || null;
}

async function listEvents(filters = {}) {
  let sql = `SELECT e.*, u.full_name as host_name, u.slug as host_slug
             FROM events e
             LEFT JOIN users u ON e.host_user_id = u.id`;
  const conditions = [];
  const args = [];

  if (filters.status) {
    conditions.push('e.status = ?');
    args.push(filters.status);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY e.event_datetime DESC';

  const result = await db.execute({ sql, args });
  return result.rows;
}

async function getEventsByDateRange(from, to) {
  const result = await db.execute({
    sql: `SELECT e.*, u.full_name as host_name, u.slug as host_slug
          FROM events e
          LEFT JOIN users u ON e.host_user_id = u.id
          WHERE e.status IN ('scheduled', 'active', 'finished')
          AND DATE(e.event_datetime) >= ? AND DATE(e.event_datetime) <= ?
          ORDER BY e.event_datetime ASC`,
    args: [from, to],
  });
  return result.rows;
}

// ---------------------------------------------------------------------------
// Attendees
// ---------------------------------------------------------------------------

async function registerAttendee(eventId, { first_name, last_name, email }) {
  // Check if already registered
  const existing = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE event_id = ? AND email = ?',
    args: [eventId, email],
  });

  if (existing.rows.length > 0) {
    return { attendee: existing.rows[0], isExisting: true };
  }

  const id = generateUUID();
  const accessToken = generateAccessToken();
  const accessTokenHash = hashAccessToken(accessToken);

  await db.execute({
    sql: `INSERT INTO event_attendees (id, event_id, first_name, last_name, email, access_token_hash)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, eventId, first_name, last_name, email, accessTokenHash],
  });

  const attendee = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE id = ?',
    args: [id],
  });

  return { attendee: attendee.rows[0], accessToken, isExisting: false };
}

async function getAttendeeByAccessToken(eventId, accessToken) {
  const hash = hashAccessToken(accessToken);
  const result = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE event_id = ? AND access_token_hash = ?',
    args: [eventId, hash],
  });
  return result.rows[0] || null;
}

async function getAttendeeById(id) {
  const result = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE id = ?',
    args: [id],
  });
  return result.rows[0] || null;
}

async function updateAttendeePayment(attendeeId, {
  stripe_payment_intent_id, stripe_customer_id, amount_paid, currency,
}) {
  await db.execute({
    sql: `UPDATE event_attendees
          SET stripe_payment_intent_id = ?, stripe_customer_id = ?, amount_paid = ?, currency = ?, status = 'paid'
          WHERE id = ?`,
    args: [stripe_payment_intent_id, stripe_customer_id, amount_paid, currency, attendeeId],
  });

  return getAttendeeById(attendeeId);
}

async function updateAttendeeStatus(attendeeId, status) {
  await db.execute({
    sql: 'UPDATE event_attendees SET status = ? WHERE id = ?',
    args: [status, attendeeId],
  });
  return getAttendeeById(attendeeId);
}

async function listAttendees(eventId) {
  const result = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE event_id = ? ORDER BY created_at ASC',
    args: [eventId],
  });
  return result.rows;
}

async function getAttendeeCount(eventId) {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM event_attendees
          WHERE event_id = ? AND status IN ('registered', 'paid', 'joined')`,
    args: [eventId],
  });
  return result.rows[0].count;
}

// ---------------------------------------------------------------------------
// Event Lifecycle
// ---------------------------------------------------------------------------

async function startEvent(id, { livekitRoomName = null, videoStartedAt = null } = {}) {
  const setClauses = ["status = 'active'"];
  const args = [];

  if (livekitRoomName) {
    setClauses.push('livekit_room_name = ?');
    args.push(livekitRoomName);
  }
  if (videoStartedAt) {
    setClauses.push('video_started_at = ?');
    args.push(videoStartedAt);
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE events SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });
  return getEventById(id);
}

async function endEvent(id) {
  // Change #3: also stamp finished_at (guarded so re-ending an event does not
  // reset the timestamp the credit scheduler uses to compute the grace period).
  await db.execute({
    sql: `UPDATE events
          SET status = 'finished',
              finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP)
          WHERE id = ?`,
    args: [id],
  });
  const event = await getEventById(id);
  if (event && event.access_type === 'paid') {
    logger.info(
      { eventId: id, finishedAt: event.finished_at, hostUserId: event.host_user_id },
      '[eventService] Paid event finished — eligible for credit scheduler after grace period'
    );
  }
  return event;
}

/**
 * Change #3 — Admin fallback: mark a paid event finished when the end-of-stream
 * hook never fired. Sets `finished_at` (default: now) only if it is still NULL,
 * and flips status to 'finished'. Idempotent.
 *
 * @param {string} id
 * @param {string|null} [finishedAt] ISO timestamp; defaults to CURRENT_TIMESTAMP.
 * @returns {Promise<object|null>} Updated event, or null if not found.
 */
async function markEventFinished(id, finishedAt = null) {
  const current = await getEventById(id);
  if (!current) return null;

  if (finishedAt) {
    await db.execute({
      sql: `UPDATE events
            SET status = 'finished',
                finished_at = ?
            WHERE id = ? AND finished_at IS NULL`,
      args: [finishedAt, id],
    });
  } else {
    await db.execute({
      sql: `UPDATE events
            SET status = 'finished',
                finished_at = CURRENT_TIMESTAMP
            WHERE id = ? AND finished_at IS NULL`,
      args: [id],
    });
  }
  return getEventById(id);
}

/**
 * Change #3 — Admin override: set/clear `host_credit_excluded` on an event. The
 * event credit scheduler skips excluded events permanently until unexcluded.
 */
async function setEventCreditExcluded(id, excluded) {
  const value = excluded ? 1 : 0;
  await db.execute({
    sql: `UPDATE events SET host_credit_excluded = ? WHERE id = ?`,
    args: [value, id],
  });
  return getEventById(id);
}

// ---------------------------------------------------------------------------
// Bans
// ---------------------------------------------------------------------------

async function banAttendee(eventId, email, ipAddress, reason) {
  const id = generateUUID();
  await db.execute({
    sql: `INSERT INTO event_bans (id, event_id, email, ip_address, reason) VALUES (?, ?, ?, ?, ?)`,
    args: [id, eventId, email || null, ipAddress || null, reason || 'spam'],
  });
  return id;
}

async function isEmailBanned(eventId, email) {
  if (!email) return false;
  const result = await db.execute({
    sql: 'SELECT id FROM event_bans WHERE event_id = ? AND email = ? LIMIT 1',
    args: [eventId, email],
  });
  return result.rows.length > 0;
}

async function isIpBanned(eventId, ipAddress) {
  if (!ipAddress) return false;
  const result = await db.execute({
    sql: 'SELECT id FROM event_bans WHERE event_id = ? AND ip_address = ? LIMIT 1',
    args: [eventId, ipAddress],
  });
  return result.rows.length > 0;
}

async function updateAttendeeIp(attendeeId, ipAddress) {
  if (!ipAddress) return;
  await db.execute({
    sql: 'UPDATE event_attendees SET ip_address = ? WHERE id = ?',
    args: [ipAddress, attendeeId],
  });
}

async function markAttendeeChatBanned(attendeeId) {
  await db.execute({
    sql: 'UPDATE event_attendees SET chat_banned = 1 WHERE id = ?',
    args: [attendeeId],
  });
}

async function isAttendeeChatBanned(attendeeId) {
  const result = await db.execute({
    sql: 'SELECT chat_banned FROM event_attendees WHERE id = ? LIMIT 1',
    args: [attendeeId],
  });
  return result.rows.length > 0 && result.rows[0].chat_banned === 1;
}

// ---------------------------------------------------------------------------
// Email Verification (OTP)
// ---------------------------------------------------------------------------

async function sendVerificationCode(eventId, attendeeId) {
  const attendee = await getAttendeeById(attendeeId);
  if (!attendee || attendee.event_id !== eventId) return null;

  const code = generateOTPCode();
  const codeHash = createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.execute({
    sql: `UPDATE event_attendees SET verification_code_hash = ?, verification_code_expires_at = ? WHERE id = ?`,
    args: [codeHash, expiresAt, attendeeId],
  });

  return { code, attendee };
}

async function verifyEmailCode(eventId, attendeeId, code) {
  const attendee = await getAttendeeById(attendeeId);
  if (!attendee || attendee.event_id !== eventId) {
    return { valid: false, error: 'Asistente no encontrado' };
  }

  if (!attendee.verification_code_hash || !attendee.verification_code_expires_at) {
    return { valid: false, error: 'No se encontró una verificación pendiente' };
  }

  if (new Date(attendee.verification_code_expires_at) < new Date()) {
    return { valid: false, error: 'El código ha expirado. Solicita uno nuevo' };
  }

  const codeHash = createHash('sha256').update(code).digest('hex');
  if (codeHash !== attendee.verification_code_hash) {
    return { valid: false, error: 'Código de verificación incorrecto' };
  }

  await db.execute({
    sql: `UPDATE event_attendees SET email_verified = 1, verification_code_hash = NULL, verification_code_expires_at = NULL WHERE id = ?`,
    args: [attendeeId],
  });

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Password Access
// ---------------------------------------------------------------------------

async function verifyAttendeePassword(eventId, email, password) {
  const result = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE event_id = ? AND email = ? AND access_password = ?',
    args: [eventId, email, password],
  });

  if (result.rows.length === 0) {
    // Check if email exists but password doesn't match
    const emailCheck = await db.execute({
      sql: 'SELECT id, access_password FROM event_attendees WHERE event_id = ? AND email = ?',
      args: [eventId, email],
    });

    if (emailCheck.rows.length === 0 || !emailCheck.rows[0].access_password) {
      return { found: false, error: 'No se encontró un registro con este correo electrónico' };
    }
    return { found: false, error: 'Contraseña incorrecta' };
  }

  const attendee = result.rows[0];

  // Generate a new access token for this session
  const accessToken = generateAccessToken();
  const accessTokenHash = hashAccessToken(accessToken);

  await db.execute({
    sql: 'UPDATE event_attendees SET access_token_hash = ? WHERE id = ?',
    args: [accessTokenHash, attendee.id],
  });

  return { found: true, attendee, accessToken };
}

async function setAttendeePassword(attendeeId, password) {
  await db.execute({
    sql: 'UPDATE event_attendees SET access_password = ?, email_verified = 1 WHERE id = ?',
    args: [password, attendeeId],
  });
}

module.exports = {
  createEvent,
  updateEvent,
  deleteEvent,
  getEventById,
  getEventBySlug,
  listEvents,
  getEventsByDateRange,
  registerAttendee,
  getAttendeeByAccessToken,
  getAttendeeById,
  updateAttendeePayment,
  updateAttendeeStatus,
  listAttendees,
  getAttendeeCount,
  startEvent,
  endEvent,
  markEventFinished,
  setEventCreditExcluded,
  banAttendee,
  isEmailBanned,
  isIpBanned,
  updateAttendeeIp,
  markAttendeeChatBanned,
  isAttendeeChatBanned,
  // Email verification & password access
  generateEventPassword,
  sendVerificationCode,
  verifyEmailCode,
  verifyAttendeePassword,
  setAttendeePassword,
  // Exposed for token verification
  hashAccessToken,
};
