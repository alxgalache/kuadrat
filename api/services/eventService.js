const { db } = require('../config/database');
const { randomUUID, randomBytes } = require('crypto');
const slugify = require('slugify');
const logger = require('../config/logger');
const emailOtp = require('../utils/emailOtp');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID() {
  return randomUUID();
}

const generateAccessToken = emailOtp.generateOpaqueToken;
const hashAccessToken = emailOtp.sha256;

/** 6-char event password (excludes ambiguous chars: 0OI1L). */
const generateEventPassword = emailOtp.generateAccessPassword;

function generateSlug(title) {
  return slugify(title, { lower: true, strict: true }) + '-' + randomBytes(4).toString('hex');
}

// ---------------------------------------------------------------------------
// Event CRUD
// ---------------------------------------------------------------------------

async function createEvent({
  title, description, event_datetime, duration_minutes, host_user_id,
  cover_image_url, access_type, price, currency, format, content_type,
  category, video_url, video_url_av1, max_attendees, status, provider, interaction_mode,
  allow_mobile_host_console, allow_host_video_quality, host_echo_cancellation,
  recording_enabled, is_test,
}) {
  const id = generateUUID();
  const slug = generateSlug(title);

  await db.execute({
    sql: `INSERT INTO events (id, title, slug, description, event_datetime, duration_minutes,
          host_user_id, cover_image_url, access_type, price, currency, format, content_type,
          category, video_url, video_url_av1, max_attendees, status, provider, interaction_mode,
          allow_mobile_host_console, allow_host_video_quality, host_echo_cancellation,
          recording_enabled, is_test)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, title, slug, description || null, event_datetime, duration_minutes || 60,
      host_user_id, cover_image_url || null, access_type || 'free',
      price || null, currency || 'EUR', format || 'live', content_type || 'streaming',
      category, video_url || null, video_url_av1 || null, max_attendees || null, status || 'draft',
      provider || 'livekit', interaction_mode || 'broadcast',
      allow_mobile_host_console ? 1 : 0,
      allow_host_video_quality ? 1 : 0,
      host_echo_cancellation ? 1 : 0,
      recording_enabled ? 1 : 0,
      is_test ? 1 : 0,
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
    'category', 'video_url', 'video_url_av1', 'max_attendees', 'status', 'provider', 'interaction_mode',
    'allow_mobile_host_console', 'allow_host_video_quality', 'host_echo_cancellation',
    'recording_enabled', 'is_test',
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

// Written only by videoDurationService (live-event-access-hardening): no admin
// request can set it, which is why it is not in updateEvent's allowedFields.
async function setVideoDuration(id, seconds) {
  await db.execute({
    sql: 'UPDATE events SET video_duration_seconds = ? WHERE id = ?',
    args: [seconds, id],
  });
}

// The video passes the closing scheduler watches
async function listActiveVideoEvents() {
  const result = await db.execute({
    sql: "SELECT * FROM events WHERE status = 'active' AND format = 'video' AND video_started_at IS NOT NULL",
    args: [],
  });
  return result.rows;
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

// The public calendar: feeds /live and the sitemap, its only two consumers.
// Test events never appear here (event-video-cdn-delivery); getEventBySlug
// deliberately does NOT filter them, so the tester's direct link works.
async function getEventsByDateRange(from, to) {
  const result = await db.execute({
    sql: `SELECT e.*, u.full_name as host_name, u.slug as host_slug
          FROM events e
          LEFT JOIN users u ON e.host_user_id = u.id
          WHERE e.status IN ('scheduled', 'active', 'finished')
          AND e.is_test = 0
          AND DATE(e.event_datetime) >= ? AND DATE(e.event_datetime) <= ?
          ORDER BY e.event_datetime ASC`,
    args: [from, to],
  });
  return result.rows;
}

// ---------------------------------------------------------------------------
// Attendees
// ---------------------------------------------------------------------------

/**
 * The attendee row for this email in this event, or null. The email is
 * normalised here too, so no caller can look up a spelling that was never
 * stored.
 */
async function getAttendeeByEmail(eventId, email) {
  const result = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE event_id = ? AND email = ? LIMIT 1',
    args: [eventId, emailOtp.normalizeEmail(email)],
  });
  return result.rows[0] || null;
}

/**
 * Create — or find — the attendee row for this email. Issues NO credential.
 *
 * It used to mint the access token right here, before the OTP step, and hand
 * it back in the response: the client stored it, and any holder of it could
 * enter a free event without ever proving the email (enforce-verification-
 * gates). A new row now starts with access_token_hash NULL, and the token is
 * born in verifyEmailCode, in the same statement that sets email_verified.
 * An existing row is returned untouched, whatever its state.
 *
 * @returns {Promise<{ attendee: object, isExisting: boolean }>}
 */
async function registerAttendee(eventId, { first_name, last_name, email }) {
  const normalizedEmail = emailOtp.normalizeEmail(email);

  const existing = await getAttendeeByEmail(eventId, normalizedEmail);
  if (existing) {
    return { attendee: existing, isExisting: true };
  }

  const id = generateUUID();
  await db.execute({
    sql: `INSERT INTO event_attendees (id, event_id, first_name, last_name, email)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, eventId, first_name, last_name, normalizedEmail],
  });

  return { attendee: await getAttendeeById(id), isExisting: false };
}

/**
 * Find or create the attendee row an admin uses to sit in an event they do
 * not host, and hand back a fresh access token for it.
 *
 * Deliberately produces a REAL attendee, not a parallel path: that identity is
 * what getViewerToken, renewToken, getWhiteboardToken, getVideoToken,
 * report-spam and the authenticated Socket.IO room all re-derive. Special-
 * casing the admin in each of them would be six places to keep in step.
 *
 * `status` stays 'registered' even for a paid event — writing 'paid' with
 * amount_paid = 0 would be a lie in a table the invoicing and payout queries
 * read. The payment gate is skipped on is_staff instead.
 *
 * A new token on every call, mirroring verifyAttendeePassword: the stored one
 * is a hash, so there is nothing to read back.
 */
async function createOrGetStaffAttendee(eventId, { email, fullName }) {
  const [firstName, ...rest] = String(fullName || '').trim().split(/\s+/);
  const first_name = firstName || 'Admin';
  const last_name = rest.join(' ') || 'Galería';

  const accessToken = generateAccessToken();
  const accessTokenHash = hashAccessToken(accessToken);

  const existing = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE event_id = ? AND email = ?',
    args: [eventId, email],
  });

  if (existing.rows.length > 0) {
    const attendee = existing.rows[0];
    await db.execute({
      sql: 'UPDATE event_attendees SET access_token_hash = ?, is_staff = 1, email_verified = 1 WHERE id = ?',
      args: [accessTokenHash, attendee.id],
    });
    return { attendee: { ...attendee, is_staff: 1, email_verified: 1 }, accessToken };
  }

  const id = generateUUID();
  await db.execute({
    sql: `INSERT INTO event_attendees
            (id, event_id, first_name, last_name, email, access_token_hash, is_staff, email_verified, status)
          VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'registered')`,
    args: [id, eventId, first_name, last_name, email, accessTokenHash],
  });

  const created = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE id = ?',
    args: [id],
  });

  return { attendee: created.rows[0], accessToken };
}

/**
 * The staff row an admin holds in this event, looked up by their account email
 * (the key createOrGetStaffAttendee writes it under). Lets an endpoint that
 * authenticates by JWT — not by attendee credentials — reach the admin's
 * attendee identity. null when the admin never entered the event.
 */
async function getStaffAttendeeByEmail(eventId, email) {
  if (!email) return null;
  const result = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE event_id = ? AND email = ? AND is_staff = 1 LIMIT 1',
    args: [eventId, email],
  });
  return result.rows[0] || null;
}

/**
 * The ONLY lookup of an attendee by access token, and therefore the gate
 * every attendee-credential entry point goes through: /token, /renew-token,
 * the whiteboard token and upload, /video-token, report-spam, /session and
 * the authenticated Socket.IO room.
 *
 * A row counts as a credential only once its email is verified, or when it is
 * staff (the admin, whose JWT already proved the identity). Filtering here
 * rather than in each caller is deliberate: seven places that must agree is
 * how the Socket.IO room once ended up with its own divergent copy of
 * requiresPayment. api/tests/eventRegistrationVerification.test.js fails if
 * access_token_hash appears in SQL anywhere but this module.
 */
async function getAttendeeByAccessToken(eventId, accessToken) {
  if (!accessToken) return null;
  const hash = hashAccessToken(accessToken);
  const result = await db.execute({
    sql: `SELECT * FROM event_attendees
          WHERE event_id = ? AND access_token_hash = ?
            AND (email_verified = 1 OR is_staff = 1)`,
    args: [eventId, hash],
  });
  return result.rows[0] || null;
}

/**
 * Does this stored { attendeeId, accessToken } pair give access to the event?
 * Backs POST /api/events/:id/session, which the event page asks before it
 * claims «Ya tienes acceso».
 *
 * The happy path is the same filtered lookup every gate uses. Only when that
 * fails does a second read run, to tell the attendee WHY — a replaced token
 * and an unverified registration need different advice. Same shape as the
 * password-reset expiry check: the extra query costs nothing on success.
 *
 * @returns {Promise<{ attendee: object } | { reason: string }>} reason is one of
 *   SESSION_INVALID | SESSION_REPLACED | SESSION_UNVERIFIED | SESSION_BANNED |
 *   SESSION_PAYMENT_REQUIRED
 */
async function resolveAttendeeSession(event, { attendeeId, accessToken, clientIp }) {
  const attendee = await getAttendeeByAccessToken(event.id, accessToken);

  if (!attendee || attendee.id !== attendeeId) {
    const row = await getAttendeeById(attendeeId);
    if (!row || row.event_id !== event.id) return { reason: 'SESSION_INVALID' };
    const tokenMatchesRow = Boolean(row.access_token_hash)
      && emailOtp.safeEqual(row.access_token_hash, hashAccessToken(accessToken));
    if (tokenMatchesRow && Number(row.email_verified) !== 1 && Number(row.is_staff) !== 1) {
      return { reason: 'SESSION_UNVERIFIED' };
    }
    return { reason: 'SESSION_REPLACED' };
  }

  if (await isEmailBanned(event.id, attendee.email)) return { reason: 'SESSION_BANNED' };
  if (clientIp && await isIpBanned(event.id, clientIp)) return { reason: 'SESSION_BANNED' };
  if (requiresPayment(event, attendee)) return { reason: 'SESSION_PAYMENT_REQUIRED' };

  return { attendee };
}

async function getAttendeeById(id) {
  const result = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE id = ?',
    args: [id],
  });
  return result.rows[0] || null;
}

/**
 * Whether this attendee is the co-presenter of a broadcast Agora event: the
 * gallery admin interviewing the host, with camera and microphone.
 *
 * The ONLY copy of this condition. The token endpoints (role + `coHost` flag)
 * and the authenticated Socket.IO room (presence) must agree on it, or the
 * admin would get a publisher token without the controls, or the controls
 * without the token.
 *
 * `is_staff` alone is not enough. It is a snapshot taken when the admin used
 * "Entrar como administrador", and the resulting session lives in the
 * browser's localStorage with no expiry of its own: someone who has since
 * stopped being an admin would keep the right to publish into any stream. The
 * role is therefore re-checked against `users` on every call.
 *
 * @param {object} event - Row from `events`
 * @param {object} attendee - Row from `event_attendees`
 * @returns {Promise<boolean>}
 */
async function isBroadcastCohost(event, attendee) {
  if (!event || !attendee) return false;
  if (event.provider !== 'agora' || event.interaction_mode !== 'broadcast') return false;
  if (Number(attendee.is_staff) !== 1) return false;

  const result = await db.execute({
    sql: "SELECT 1 FROM users WHERE email = ? AND role = 'admin' LIMIT 1",
    args: [attendee.email],
  });
  return result.rows.length > 0;
}

/**
 * Whether this attendee still owes money for this event.
 *
 * Staff attendees (the gallery admin sitting in an event they did not host)
 * are exempt: charging the owner of the platform to watch a stream organised
 * from their own panel makes no sense. Every OTHER check — event active, room
 * available, email ban, IP ban — still applies to them, so this predicate is
 * deliberately narrow.
 *
 * One helper rather than the same condition inlined at every gate: the token
 * endpoints and the authenticated Socket.IO room must agree, and a divergence
 * would show up as the admin getting a whiteboard token but not being able to
 * upload to it, or getting an RTC token but being refused by the chat room.
 */
function requiresPayment(event, attendee) {
  if (event.access_type !== 'paid') return false;
  if (Number(attendee.is_staff) === 1) return false;
  return !['paid', 'joined'].includes(attendee.status);
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

/** The attendee a PaymentIntent was already recorded against, or null. */
async function getAttendeeByPaymentIntent(paymentIntentId) {
  const result = await db.execute({
    sql: 'SELECT * FROM event_attendees WHERE stripe_payment_intent_id = ? LIMIT 1',
    args: [paymentIntentId],
  });
  return result.rows[0] || null;
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

/**
 * SQL for "this attendee holds a seat": verified, not staff, not cancelled.
 * The public "N asistentes" figure, the max_attendees check in /register and
 * the atomic capacity guard in verifyEmailCode all count exactly this, so the
 * three cannot disagree about whether the event is full.
 *
 * Unverified rows hold no seat: /register has no proof behind it, and
 * counting them let anyone fill an event with invented emails. Staff (the
 * admin sitting in) must not inflate it either. listAttendees deliberately
 * does NOT filter — the admin panel shows every row, labelling the
 * unverified ones.
 */
const SEAT_HOLDER_CONDITION = `email_verified = 1 AND is_staff = 0
            AND status IN ('registered', 'paid', 'joined')`;

async function getAttendeeCount(eventId) {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM event_attendees
          WHERE event_id = ? AND ${SEAT_HOLDER_CONDITION}`,
    args: [eventId],
  });
  return result.rows[0].count;
}

// ---------------------------------------------------------------------------
// Event Lifecycle
// ---------------------------------------------------------------------------

async function startEvent(id, { livekitRoomName = null, videoStartedAt = null, agoraChannelName = null } = {}) {
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
  if (agoraChannelName) {
    setClauses.push('agora_channel_name = ?');
    args.push(agoraChannelName);
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

/**
 * Agora broadcast mode: persist the current promotion state. speaker_granted
 * drives the role of every future/renewed RTC token (design D4), so it
 * survives api restarts and token renewals.
 */
async function setSpeakerGranted(attendeeId, granted) {
  await db.execute({
    sql: 'UPDATE event_attendees SET speaker_granted = ? WHERE id = ?',
    args: [granted ? 1 : 0, attendeeId],
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

/**
 * Send-side half of the email proof. The cooldown and the write are one
 * guarded UPDATE, so two sends racing inside the window cannot both go out.
 * A send resets the attempt counter: the cap is per code, not per attendee.
 *
 * @returns {Promise<null | { tooSoon: true, attendee } | { code, attendee }>}
 *   null when the attendee does not belong to this event.
 */
async function sendVerificationCode(eventId, attendeeId) {
  const attendee = await getAttendeeById(attendeeId);
  if (!attendee || attendee.event_id !== eventId) return null;

  const code = emailOtp.generateOtpCode();
  const expiresAt = new Date(Date.now() + emailOtp.OTP_TTL_MS).toISOString();

  // verification_sent_at is written as CURRENT_TIMESTAMP and compared in SQL:
  // same zone-less UTC shape on both sides.
  const update = await db.execute({
    sql: `UPDATE event_attendees
          SET verification_code_hash = ?, verification_code_expires_at = ?,
              verification_attempts = 0, verification_sent_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND (verification_sent_at IS NULL
                 OR datetime(verification_sent_at) <= datetime('now', ?))`,
    args: [emailOtp.sha256(code), expiresAt, attendeeId, `-${emailOtp.OTP_RESEND_COOLDOWN_SECONDS} seconds`],
  });

  if (update.rowsAffected === 0) return { tooSoon: true, attendee };
  return { code, attendee };
}

/**
 * Verify the code — the proof of email ownership — and, in the same
 * statement, turn the row into a credential: email_verified = 1 and a fresh
 * access token. This is the only place an attendee token is born (the admin's
 * staff row aside, whose JWT is its proof).
 *
 * The UPDATE also carries the capacity guard (design D4). Turso runs each
 * statement atomically and SQLite serialises writes, so two attendees racing
 * for the last seat cannot both win. A row that is already verified keeps its
 * seat and is exempt: re-verifying from a new device is how an attendee
 * recovers access.
 *
 * @returns {Promise<
 *   { valid: true, attendee: object, accessToken: string } |
 *   { valid: false, reason: string, error: string }
 * >} reason: ATTENDEE_NOT_FOUND | OTP_NOT_PENDING | OTP_EXPIRED |
 *    OTP_TOO_MANY_ATTEMPTS | OTP_INVALID | EVENT_FULL
 */
async function verifyEmailCode(eventId, attendeeId, code) {
  const attendee = await getAttendeeById(attendeeId);
  if (!attendee || attendee.event_id !== eventId) {
    return { valid: false, reason: 'ATTENDEE_NOT_FOUND', error: 'Asistente no encontrado' };
  }

  if (!attendee.verification_code_hash || !attendee.verification_code_expires_at) {
    return { valid: false, reason: 'OTP_NOT_PENDING', error: 'No se encontró una verificación pendiente' };
  }

  if (new Date(attendee.verification_code_expires_at) < new Date()) {
    return { valid: false, reason: 'OTP_EXPIRED', error: 'El código ha expirado. Solicita uno nuevo' };
  }

  if (Number(attendee.verification_attempts) >= emailOtp.EVENT_OTP_MAX_ATTEMPTS) {
    return { valid: false, reason: 'OTP_TOO_MANY_ATTEMPTS', error: 'Demasiados intentos. Solicita un nuevo código' };
  }

  const codeHash = emailOtp.sha256(String(code ?? ''));
  if (!emailOtp.safeEqual(codeHash, attendee.verification_code_hash)) {
    // Bound to the current code: a guess that lands after a resend must not
    // count against the new code.
    await db.execute({
      sql: `UPDATE event_attendees SET verification_attempts = verification_attempts + 1
            WHERE id = ? AND verification_code_hash = ?`,
      args: [attendeeId, attendee.verification_code_hash],
    });
    return { valid: false, reason: 'OTP_INVALID', error: 'Código de verificación incorrecto' };
  }

  const accessToken = generateAccessToken();
  const update = await db.execute({
    sql: `UPDATE event_attendees
          SET email_verified = 1, access_token_hash = ?,
              verification_code_hash = NULL, verification_code_expires_at = NULL,
              verification_attempts = 0
          WHERE id = ? AND event_id = ? AND verification_code_hash = ?
            AND (
              email_verified = 1
              OR (SELECT COALESCE(max_attendees, 0) FROM events WHERE id = ?) <= 0
              OR (SELECT COUNT(*) FROM event_attendees
                   WHERE event_id = ? AND ${SEAT_HOLDER_CONDITION})
                 < (SELECT max_attendees FROM events WHERE id = ?)
            )`,
    args: [hashAccessToken(accessToken), attendeeId, eventId, codeHash, eventId, eventId, eventId],
  });

  if (update.rowsAffected === 0) {
    // Either the event filled up (the code is still there, untouched) or a
    // concurrent request consumed the code first.
    const fresh = await getAttendeeById(attendeeId);
    if (fresh?.verification_code_hash === codeHash) {
      return { valid: false, reason: 'EVENT_FULL', error: 'Aforo completo' };
    }
    return { valid: false, reason: 'OTP_NOT_PENDING', error: 'No se encontró una verificación pendiente' };
  }

  return { valid: true, attendee: await getAttendeeById(attendeeId), accessToken };
}

// ---------------------------------------------------------------------------
// Password Access
// ---------------------------------------------------------------------------

async function verifyAttendeePassword(eventId, rawEmail, password) {
  const email = emailOtp.normalizeEmail(rawEmail);
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

/**
 * Store the attendee's access password. Deliberately does NOT touch
 * email_verified any more: it used to set it as a side effect, which let a
 * paid confirmation mark an email as verified that nobody had verified.
 * Only verifyEmailCode (and the admin's staff row) write that flag.
 */
async function setAttendeePassword(attendeeId, password) {
  await db.execute({
    sql: 'UPDATE event_attendees SET access_password = ? WHERE id = ?',
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
  setVideoDuration,
  listActiveVideoEvents,
  registerAttendee,
  getAttendeeByEmail,
  createOrGetStaffAttendee,
  getStaffAttendeeByEmail,
  getAttendeeByAccessToken,
  resolveAttendeeSession,
  getAttendeeById,
  isBroadcastCohost,
  requiresPayment,
  updateAttendeePayment,
  getAttendeeByPaymentIntent,
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
  setSpeakerGranted,
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
