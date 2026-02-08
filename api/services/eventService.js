const { db } = require('../config/database');
const { randomUUID, createHash, randomBytes } = require('crypto');
const slugify = require('slugify');

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

async function startEvent(id, livekitRoomName) {
  await db.execute({
    sql: `UPDATE events SET status = 'active', livekit_room_name = ? WHERE id = ?`,
    args: [livekitRoomName, id],
  });
  return getEventById(id);
}

async function endEvent(id) {
  await db.execute({
    sql: `UPDATE events SET status = 'finished' WHERE id = ?`,
    args: [id],
  });
  return getEventById(id);
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
  // Exposed for token verification
  hashAccessToken,
};
