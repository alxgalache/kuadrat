/**
 * Agora Cloud Recording for live Agora events (change: agora-event-recording).
 *
 * The recording service is a server-side Agora client: it joins the channel
 * as an audience member, subscribes to the streams and writes the files
 * straight into our S3 bucket. Everything is driven over REST
 * (acquire → start → query / updateLayout → stop).
 *
 * THE RECONCILER IS THE AUTHORITY. `reconcileEvent` reads the event and its
 * tasks from the database and converges reality on them: start when the event
 * should be recorded and nothing is running, stop when something runs and
 * should not, notice a recorder that died, fix the layout. The scheduler calls
 * it every 30 s; the lifecycle endpoints and the `screen_share` socket message
 * call it immediately (`triggerReconcile`) so nothing waits a whole tick. None
 * of those paths has recording logic of its own, and none of them waits for
 * Agora: its REST gateway is documented in agoraService as slow and 504-prone,
 * and a slow recording must never delay a live event.
 *
 * Two layers of mutual exclusion: calls are serialised per event inside the
 * process, and the database refuses a second live task per event (partial
 * unique index) and a second task with the same attempt number.
 *
 * SECRETS: the acquire/start bodies carry the bucket key and the recorder
 * token. They are never logged, never stored and never sent to Sentry; error
 * messages are built from the HTTP status and Agora's numeric code only, and
 * the one free-text field kept (Agora's `reason`, for the admin) is scrubbed.
 */
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');
const agoraService = require('./agoraService');
const { isRecordingEligible, recordingModeFor } = require('../utils/eventRecording');
const { sqlUtcTimestamp, parseSqlUtcDate } = require('../utils/passwordSecurity');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Hard ceiling for the recording of one event, counted from the start of its
// FIRST task. It is what stops the recording of an event nobody ends (the
// host closes the tab without «Finalizar»), which would otherwise stay
// `active` — and recording — forever.
const RECORDING_MAX_MINUTES = 180;
// Retention promised in the privacy policy. Enforced by the bucket's lifecycle
// rule, NOT by this process: this constant only drives the startup check of
// that rule and the «Disponible hasta» date shown to the admin.
const RECORDING_RETENTION_DAYS = 30;
const RECORDING_MAX_ATTEMPTS = 10;
const RECORDING_RETRY_COOLDOWN_SECONDS = 60;
// Agora asks to wait for the first slice before `query` (15 s in mix, 1 min
// in individual); asking earlier can answer 404 for a healthy task.
const RECORDING_QUERY_GRACE_SECONDS = 90;
// A row stuck in `starting` or `stopping` for longer than this is stale.
const RECORDING_STALE_SECONDS = 120;
// Tolerates the host losing connection for up to 30 min without cutting the
// recording into pieces. Idle time bills as audio minutes (~4 cents per half
// hour), and once everybody has left it is also the fuse if the api is down.
const RECORDING_MAX_IDLE_SECONDS = 1800;
// Cloud Recording cannot renew its token: it must outlive the whole window.
const RECORDER_TOKEN_MARGIN_SECONDS = 900;
const RECORDING_PREFIX_ROOT = 'eventos';
// Agora's fileNamePrefix: letters and digits only, 128 chars in total.
const FILE_NAME_PREFIX_MAX = 128;
// The screen share is the most detailed source recorded (1792 × 1008), so the
// canvas is 1080p. Agora bills recording by the streams recorded, not by the
// canvas, so this only costs storage (verified on the first invoice).
const MIX_CANVAS = Object.freeze({ width: 1920, height: 1080, fps: 30, bitrate: 3000 });
const MIX_BACKGROUND = '#000000';
// 48 kHz, mono, ~128 kbps. The default (0) is ~48 kbps and would throw away,
// in the mixdown, the fidelity AGORA_MIC_ENCODER_HOST exists to deliver.
const MIX_AUDIO_PROFILE = 1;
// Peak-uid estimate for individual mode: 18–32. Meeting caps at 17 publishers
// (16 attendees + host); over-estimating costs nothing, under-estimating does.
const INDIVIDUAL_UID_GROUP = 4;
const LIVE_STATUSES = ['starting', 'recording', 'stopping'];
const AGORA_REST_BASE = 'https://api.agora.io';
// `stop` with async_stop:false waits up to 20 s for the uploads.
const REST_TIMEOUT_MS = 30000;
// query → serverResponse.status: 6 stop requested, 7 stopped, 8 exited,
// 20 exited abnormally. We never ask for a stop without moving the row to
// `stopping` first, so any of these on a `recording` row means it died.
const QUERY_EXIT_STATUS_MIN = 6;

// ---------------------------------------------------------------------------
// Test seam (NODE_ENV=test only)
// ---------------------------------------------------------------------------

// Under test `config.recording.enabled` is always false. Tests that exercise
// the service enable it HERE, explicitly, and inject a transport; the default
// transport throws under test so a forgotten injection fails in-process
// instead of calling Agora.
let testOverrides = null;

async function defaultTransport(url, init) {
  if (config.nodeEnv === 'test') {
    throw new Error('Agora Cloud Recording REST is blocked under NODE_ENV=test');
  }
  return fetch(url, init);
}

function __configureForTests(overrides = {}) {
  if (config.nodeEnv !== 'test') {
    throw new Error('__configureForTests is only available under NODE_ENV=test');
  }
  testOverrides = { ...overrides };
}

function __resetForTests() {
  if (config.nodeEnv !== 'test') return;
  testOverrides = null;
  alerted.clear();
  chains.clear();
}

function transport() {
  return testOverrides?.transport || defaultTransport;
}

function recordingEnabled() {
  if (testOverrides) return testOverrides.enabled !== undefined ? !!testOverrides.enabled : true;
  return config.recording.enabled;
}

/** True when this environment has the app's own AWS credentials (instance role). */
function downloadsAvailable() {
  if (testOverrides && testOverrides.downloadsAvailable !== undefined) {
    return !!testOverrides.downloadsAvailable;
  }
  return config.useS3;
}

function storageSettings() {
  return testOverrides?.storage || config.recording;
}

function nowMs() {
  return testOverrides?.now ? testOverrides.now() : Date.now();
}

function sqlNow() {
  return sqlUtcTimestamp(new Date(nowMs()));
}

function ageSeconds(sqlValue) {
  const date = parseSqlUtcDate(sqlValue);
  if (!date) return Infinity;
  return (nowMs() - date.getTime()) / 1000;
}

// ---------------------------------------------------------------------------
// Pure builders
// ---------------------------------------------------------------------------

/**
 * The composite layout for a broadcast. Two states only: adaptive (one
 * publisher fills the canvas, several share it in equal windows) and, while
 * the host or the co-presenter shares a screen, vertical with the stage
 * screen (uid 2, whichever of the two publishes it) in the big
 * window. Replicating BroadcastStage exactly is a non-goal: it would be a
 * second copy of the stage logic.
 */
function mixLayoutFor(screenSharing) {
  if (screenSharing) {
    return {
      layout: 'screen',
      fields: {
        mixedVideoLayout: 2,
        maxResolutionUid: String(agoraService.HOST_SCREEN_UID),
        backgroundColor: MIX_BACKGROUND,
      },
    };
  }
  return {
    layout: 'adaptive',
    fields: { mixedVideoLayout: 1, backgroundColor: MIX_BACKGROUND },
  };
}

function alphanumeric(id) {
  return String(id).replace(/[^A-Za-z0-9]/g, '');
}

/**
 * `['eventos', <event id>, <recording id>]` without the UUID hyphens: each
 * element may only hold letters and digits, and a hyphen here is a 400 on the
 * very first real `start`.
 */
function buildFileNamePrefix(eventId, recordingId) {
  const parts = [RECORDING_PREFIX_ROOT, alphanumeric(eventId), alphanumeric(recordingId)];
  for (const part of parts) {
    if (!/^[A-Za-z0-9]+$/.test(part)) {
      throw new Error(`Invalid fileNamePrefix element: "${part}"`);
    }
  }
  if (`${parts.join('/')}/`.length > FILE_NAME_PREFIX_MAX) {
    throw new Error('fileNamePrefix exceeds 128 characters');
  }
  return parts;
}

function s3PrefixFor(fileNamePrefix) {
  return `${fileNamePrefix.join('/')}/`;
}

function buildStorageConfig({ fileNamePrefix, storage }) {
  return {
    vendor: 1, // Amazon S3
    region: storage.regionCode,
    bucket: storage.bucket,
    accessKey: storage.accessKey,
    secretKey: storage.secretKey,
    fileNamePrefix,
  };
}

function buildRecordingConfig(mode, { layout } = {}) {
  const common = {
    channelType: 1, // live profile, same as createClient({ mode: 'live' })
    streamTypes: 2, // audio and video
    videoStreamType: 0, // the HIGH stream, never the 480×270 low one
    maxIdleTime: RECORDING_MAX_IDLE_SECONDS,
    // Everything published. In a broadcast only who is on stage publishes (the
    // rest are subscribers, and co-host authentication enforces it), so this
    // is "every camera and screen on stage" — including a co-presenter whose
    // attendee uid is unknown until they join.
    subscribeVideoUids: ['#allstream#'],
    subscribeAudioUids: ['#allstream#'],
  };
  if (mode === 'mix') {
    return {
      ...common,
      audioProfile: MIX_AUDIO_PROFILE,
      transcodingConfig: { ...MIX_CANVAS, ...(layout || mixLayoutFor(false)).fields },
    };
  }
  return { ...common, streamMode: 'standard', subscribeUidGroup: INDIVIDUAL_UID_GROUP };
}

function buildStartClientRequest({ mode, token, layout, fileNamePrefix, storage }) {
  return {
    token,
    recordingConfig: buildRecordingConfig(mode, { layout }),
    // MP4 does not exist in individual mode (and ['mp4'] alone is an error in
    // mix): with VP8 publishers each uid comes out as MPD + WebM.
    recordingFileConfig: { avFileType: mode === 'mix' ? ['hls', 'mp4'] : ['hls'] },
    storageConfig: buildStorageConfig({ fileNamePrefix, storage }),
  };
}

function buildAcquireBody({ cname, uid, startClientRequest }) {
  return {
    cname,
    uid: String(uid),
    clientRequest: {
      scene: 0,
      region: 'EU', // keeps the recording service itself in Europe
      resourceExpiredHour: 24,
      // Must match the start request exactly, or start is refused.
      startParameter: startClientRequest,
    },
  };
}

/** What is left of the 180-minute window, plus a margin: the token cannot be renewed. */
function recorderTokenTtlSeconds(windowStartMs, now = nowMs()) {
  const start = windowStartMs ?? now;
  const end = start + RECORDING_MAX_MINUTES * 60 * 1000;
  const remaining = Math.max(0, Math.ceil((end - now) / 1000));
  return remaining + RECORDER_TOKEN_MARGIN_SECONDS;
}

function recorderUidFor(attempt) {
  return agoraService.RECORDER_UID_BASE + attempt;
}

function availableUntilFor(task) {
  const start = parseSqlUtcDate(task.started_at) || parseSqlUtcDate(task.created_at);
  if (!start) return null;
  return new Date(start.getTime() + RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// REST client
// ---------------------------------------------------------------------------

class RecordingRestError extends Error {
  constructor(message, { httpStatus = null, agoraCode = null, reason = null } = {}) {
    super(message);
    this.name = 'RecordingRestError';
    this.httpStatus = httpStatus;
    this.agoraCode = agoraCode;
    this.reason = reason;
  }
}

/** Remove any secret that a free-text field from Agora could echo back. */
function scrub(text, extraSecrets = []) {
  if (text === null || text === undefined) return text;
  let out = String(text);
  const storage = storageSettings();
  const secrets = [storage.secretKey, storage.accessKey, config.agora.customerSecret, ...extraSecrets]
    .filter((value) => typeof value === 'string' && value.length >= 6);
  for (const secret of secrets) out = out.split(secret).join('[redacted]');
  return out.slice(0, 300);
}

/**
 * One Cloud Recording REST call. Resolves `{ status, data }` for 2xx and 404
 * (a vanished task is an answer, not a failure); throws RecordingRestError
 * otherwise. Logs carry only identifiers — never a body.
 */
async function recordingRequest(method, path, body, logContext = {}, secrets = []) {
  const url = `${AGORA_REST_BASE}/v1/apps/${encodeURIComponent(config.agora.appId)}/cloud_recording${path}`;
  let res;
  try {
    res = await transport()(url, {
      method,
      headers: agoraService.restHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
  } catch (err) {
    logger.error(
      { ...logContext, method, networkError: err?.name || 'Error' },
      '[agoraRecording] Cloud Recording request failed (network/timeout)'
    );
    throw new RecordingRestError('No se pudo contactar con Agora Cloud Recording');
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

  if (res.ok || res.status === 404) {
    return { status: res.status, data };
  }

  const agoraCode = data && data.code !== undefined ? data.code : null;
  logger.error(
    { ...logContext, method, httpStatus: res.status, agoraCode },
    '[agoraRecording] Cloud Recording request rejected'
  );
  throw new RecordingRestError(
    `Agora respondió ${res.status}${agoraCode !== null ? ` (código ${agoraCode})` : ''}`,
    { httpStatus: res.status, agoraCode, reason: scrub(data?.reason, secrets) }
  );
}

// ---------------------------------------------------------------------------
// Alerts (log + Sentry + email), deduplicated in memory
// ---------------------------------------------------------------------------

const alerted = new Set();

async function raiseAlert(kind, dedupeKey, { event = null, detail = '', err = null } = {}) {
  if (alerted.has(dedupeKey)) return;
  alerted.add(dedupeKey);

  logger.error(
    { eventId: event?.id || null, kind, detail },
    '[agoraRecording] Recording alert'
  );

  // Lazily and never under test: requiring @sentry/node installs global
  // require hooks that break unrelated Jest suites (see dbBackupService).
  if (config.nodeEnv !== 'test') {
    try {
      const Sentry = require('../instrument.js');
      Sentry.captureException(err || new Error(`Agora recording: ${kind}`), {
        tags: { job: 'agora_recording', kind },
        extra: { eventId: event?.id || null, detail },
      });
    } catch (sentryErr) {
      logger.warn({ err: sentryErr }, '[agoraRecording] Could not report recording alert to Sentry');
    }
  }

  try {
    const emailService = require('./emailService');
    await emailService.sendRecordingAlertEmail({
      eventTitle: event?.title || null,
      eventId: event?.id || null,
      kind,
      detail,
    });
  } catch (mailErr) {
    logger.error({ err: mailErr }, '[agoraRecording] Could not send recording alert email');
  }
}

function describeError(err) {
  if (!err) return 'Error desconocido';
  if (err instanceof RecordingRestError) {
    return err.reason ? `${err.message}: ${err.reason}` : err.message;
  }
  return scrub(err.message) || 'Error desconocido';
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

async function loadEvent(eventId) {
  const result = await db.execute({
    sql: `SELECT id, title, status, provider, format, interaction_mode,
                 recording_enabled, agora_channel_name
          FROM events WHERE id = ?`,
    args: [eventId],
  });
  return result.rows[0] || null;
}

async function loadTasks(eventId) {
  const result = await db.execute({
    sql: 'SELECT * FROM event_recordings WHERE event_id = ? ORDER BY attempt ASC',
    args: [eventId],
  });
  return result.rows;
}

function isUniqueViolation(err) {
  return /UNIQUE constraint failed/i.test(String(err?.message || ''));
}

// ---------------------------------------------------------------------------
// Task operations
// ---------------------------------------------------------------------------

async function startTask(event, attempt, windowStartMs, { isStageScreenSharing } = {}) {
  const mode = recordingModeFor(event);
  const id = randomUUID();
  const fileNamePrefix = buildFileNamePrefix(event.id, id);
  const storage = storageSettings();
  const recorderUid = recorderUidFor(attempt);
  const cname = event.agora_channel_name;
  const screenSharing = mode === 'mix'
    && typeof isStageScreenSharing === 'function'
    && !!isStageScreenSharing(event.id);
  const layout = mode === 'mix' ? mixLayoutFor(screenSharing) : null;
  const logContext = { eventId: event.id, recordingId: id, mode, cname, uid: recorderUid };
  const stamp = sqlNow();

  try {
    await db.execute({
      sql: `INSERT INTO event_recordings
              (id, event_id, mode, attempt, recorder_uid, status, s3_bucket, s3_prefix,
               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'starting', ?, ?, ?, ?)`,
      args: [id, event.id, mode, attempt, recorderUid, storage.bucket,
        s3PrefixFor(fileNamePrefix), stamp, stamp],
    });
  } catch (err) {
    // Somebody else (the scheduler, another endpoint) started it first.
    if (isUniqueViolation(err)) return null;
    throw err;
  }

  let token = null;
  try {
    token = agoraService.generateRtcToken({
      channel: cname,
      uid: recorderUid,
      role: 'subscriber',
      ttlSeconds: recorderTokenTtlSeconds(windowStartMs),
    });
    const clientRequest = buildStartClientRequest({ mode, token, layout, fileNamePrefix, storage });

    const acquired = await recordingRequest(
      'POST', '/acquire',
      buildAcquireBody({ cname, uid: recorderUid, startClientRequest: clientRequest }),
      logContext, [token]
    );
    const resourceId = acquired.data?.resourceId;
    if (acquired.status === 404 || !resourceId) {
      throw new RecordingRestError('Agora no devolvió un resourceId');
    }
    await db.execute({
      sql: 'UPDATE event_recordings SET resource_id = ?, updated_at = ? WHERE id = ?',
      args: [resourceId, sqlNow(), id],
    });

    const started = await recordingRequest(
      'POST', `/resourceid/${encodeURIComponent(resourceId)}/mode/${mode}/start`,
      { cname, uid: String(recorderUid), clientRequest },
      logContext, [token]
    );
    const sid = started.data?.sid;
    if (started.status === 404 || !sid) {
      throw new RecordingRestError('Agora no devolvió un sid');
    }

    const now = sqlNow();
    await db.execute({
      sql: `UPDATE event_recordings
            SET sid = ?, status = 'recording', started_at = ?, applied_layout = ?, updated_at = ?
            WHERE id = ? AND status = 'starting'`,
      args: [sid, now, layout ? layout.layout : null, now, id],
    });
    logger.info({ ...logContext, sid }, '[agoraRecording] Recording started');
    return id;
  } catch (err) {
    const detail = describeError(err instanceof RecordingRestError ? err : new Error(scrub(err?.message, [token])));
    await db.execute({
      sql: `UPDATE event_recordings SET status = 'failed', error = ?, updated_at = ?
            WHERE id = ? AND status = 'starting'`,
      args: [detail, sqlNow(), id],
    });
    await raiseAlert('start_failed', `${event.id}:start_failed`, { event, detail, err });
    return null;
  }
}

/**
 * Move a task to `stopping` (conditional on the state it was read in), call
 * `stop`, and record what Agora reports. A 404 means the task already ended by
 * itself. A failed call leaves the row in `stopping`; it is retried once stale.
 */
async function stopTask(task, reason, event) {
  const now = sqlNow();
  const claim = task.status === 'recording'
    ? await db.execute({
      sql: `UPDATE event_recordings SET status = 'stopping', stop_reason = ?, updated_at = ?
            WHERE id = ? AND status = 'recording'`,
      args: [reason, now, task.id],
    })
    : await db.execute({
      sql: `UPDATE event_recordings SET updated_at = ?
            WHERE id = ? AND status = 'stopping' AND updated_at = ?`,
      args: [now, task.id, task.updated_at],
    });
  if (claim.rowsAffected === 0) return; // someone else is on it

  const logContext = {
    eventId: task.event_id, recordingId: task.id, mode: task.mode, uid: task.recorder_uid,
  };
  try {
    const stopped = await recordingRequest(
      'POST',
      `/resourceid/${encodeURIComponent(task.resource_id)}/sid/${encodeURIComponent(task.sid)}/mode/${task.mode}/stop`,
      {
        cname: event?.agora_channel_name || null,
        uid: String(task.recorder_uid),
        clientRequest: { async_stop: false },
      },
      logContext
    );
    const serverResponse = stopped.status === 404 ? null : stopped.data?.serverResponse || null;
    await db.execute({
      sql: `UPDATE event_recordings
            SET status = 'stopped', stopped_at = ?, upload_status = ?, file_list = ?, updated_at = ?
            WHERE id = ? AND status = 'stopping'`,
      args: [
        sqlNow(),
        serverResponse?.uploadingStatus || null,
        serverResponse?.fileList !== undefined ? JSON.stringify(serverResponse.fileList) : null,
        sqlNow(),
        task.id,
      ],
    });
    logger.info({ ...logContext, reason: task.stop_reason || reason }, '[agoraRecording] Recording stopped');
  } catch (err) {
    await raiseAlert('stop_failed', `${task.id}:stop_failed`, {
      event, detail: describeError(err), err,
    });
  }
}

/** 'alive' | 'dead' | null (could not tell: try again next tick). */
async function queryTask(task) {
  try {
    const result = await recordingRequest(
      'GET',
      `/resourceid/${encodeURIComponent(task.resource_id)}/sid/${encodeURIComponent(task.sid)}/mode/${task.mode}/query`,
      null,
      { eventId: task.event_id, recordingId: task.id, mode: task.mode, uid: task.recorder_uid }
    );
    if (result.status === 404) return 'dead';
    const status = Number(result.data?.serverResponse?.status);
    if (Number.isFinite(status) && status >= QUERY_EXIT_STATUS_MIN) return 'dead';
    return 'alive';
  } catch {
    return null;
  }
}

async function ensureLayout(task, event, isStageScreenSharing) {
  // Without the presence reader the desired layout is unknown: leave it be,
  // rather than flipping a running screen layout back to adaptive.
  if (typeof isStageScreenSharing !== 'function') return;
  const desired = mixLayoutFor(!!isStageScreenSharing(event.id));
  if (desired.layout === task.applied_layout) return;
  try {
    const result = await recordingRequest(
      'POST',
      `/resourceid/${encodeURIComponent(task.resource_id)}/sid/${encodeURIComponent(task.sid)}/mode/mix/updateLayout`,
      {
        cname: event.agora_channel_name,
        uid: String(task.recorder_uid),
        clientRequest: desired.fields,
      },
      { eventId: event.id, recordingId: task.id, mode: 'mix', uid: task.recorder_uid }
    );
    if (result.status === 404) return; // the next query will mark it interrupted
    await db.execute({
      sql: `UPDATE event_recordings SET applied_layout = ?, updated_at = ?
            WHERE id = ? AND status = 'recording'`,
      args: [desired.layout, sqlNow(), task.id],
    });
  } catch (err) {
    // Not fatal: the screen is still recorded, only smaller. Retried next pass.
    logger.warn(
      { eventId: event.id, recordingId: task.id, desired: desired.layout },
      '[agoraRecording] updateLayout failed; will retry'
    );
  }
}

// ---------------------------------------------------------------------------
// Reconciler
// ---------------------------------------------------------------------------

async function reconcileEventNow(eventId, { isStageScreenSharing } = {}) {
  const event = await loadEvent(eventId);
  if (!event) return;
  const tasks = await loadTasks(eventId);

  const startTimes = tasks
    .map((t) => parseSqlUtcDate(t.started_at))
    .filter(Boolean)
    .map((d) => d.getTime());
  const windowStartMs = startTimes.length ? Math.min(...startTimes) : null;
  const pastCeiling = windowStartMs !== null
    && nowMs() >= windowStartMs + RECORDING_MAX_MINUTES * 60 * 1000;

  const eligible = isRecordingEligible(event);
  const active = event.status === 'active' && !!event.agora_channel_name;
  const shouldRecord = recordingEnabled() && eligible && active && !pastCeiling;
  const stopReason = !active ? 'event_ended' : (pastCeiling ? 'max_duration' : 'recording_disabled');

  let live = tasks.find((t) => LIVE_STATUSES.includes(t.status)) || null;

  if (live && live.status === 'starting') {
    if (ageSeconds(live.created_at) <= RECORDING_STALE_SECONDS) return; // in flight
    await db.execute({
      sql: `UPDATE event_recordings SET status = 'failed', error = ?, updated_at = ?
            WHERE id = ? AND status = 'starting'`,
      args: ['El arranque no terminó (sin respuesta de Agora o reinicio del servidor)', sqlNow(), live.id],
    });
    live = null;
  }

  if (live && live.status === 'stopping') {
    if (ageSeconds(live.updated_at) > RECORDING_STALE_SECONDS) {
      await stopTask(live, live.stop_reason || stopReason, event);
    }
    return; // never start a new task while one is stopping
  }

  if (live && live.status === 'recording') {
    if (!shouldRecord) {
      await stopTask(live, stopReason, event);
      return;
    }
    if (ageSeconds(live.started_at) > RECORDING_QUERY_GRACE_SECONDS) {
      const health = await queryTask(live);
      if (health === 'dead') {
        await db.execute({
          sql: `UPDATE event_recordings SET status = 'interrupted', stopped_at = ?, updated_at = ?
                WHERE id = ? AND status = 'recording'`,
          args: [sqlNow(), sqlNow(), live.id],
        });
        await raiseAlert('interrupted', `${live.id}:interrupted`, {
          event,
          detail: 'La grabación se ha detenido sola en Agora. Se intenta reanudar en una tarea nueva.',
        });
        live = null;
      }
    }
    if (live) {
      if (live.mode === 'mix') await ensureLayout(live, event, isStageScreenSharing);
      return;
    }
  }

  if (!shouldRecord) return;

  const attempts = tasks.length;
  if (attempts >= RECORDING_MAX_ATTEMPTS) {
    await raiseAlert('gave_up', `${event.id}:gave_up`, {
      event,
      detail: `Se han agotado los ${RECORDING_MAX_ATTEMPTS} intentos de grabación de este evento.`,
    });
    return;
  }
  const lastFailed = [...tasks].reverse().find((t) => t.status === 'failed');
  if (lastFailed && ageSeconds(lastFailed.updated_at) < RECORDING_RETRY_COOLDOWN_SECONDS) return;

  await startTask(event, attempts, windowStartMs, { isStageScreenSharing });
}

// Per-event serialisation inside the process.
const chains = new Map();

/**
 * Converge the recording of one event on what the database says it should be.
 * Safe to call from anywhere, any number of times.
 *
 * @param {string} eventId
 * @param {{ isStageScreenSharing?: (eventId: string) => boolean }} [options]
 *   Reader of the stage screen's flag in the socket presence (host or
 *   co-presenter). Without
 *   it the layout is left untouched.
 */
function reconcileEvent(eventId, options = {}) {
  const previous = chains.get(eventId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => reconcileEventNow(eventId, options));
  chains.set(eventId, next);
  next.then(
    () => { if (chains.get(eventId) === next) chains.delete(eventId); },
    () => { if (chains.get(eventId) === next) chains.delete(eventId); }
  );
  return next;
}

/**
 * Fire-and-forget entry point for the lifecycle endpoints and the socket:
 * never awaited, never throws. A no-op when recording is not enabled.
 */
function triggerReconcile(eventId, { eventSocket = null, isStageScreenSharing = null } = {}) {
  if (!recordingEnabled() || !eventId) return;
  const reader = isStageScreenSharing
    || (eventSocket && typeof eventSocket.isStageScreenSharing === 'function'
      ? eventSocket.isStageScreenSharing.bind(eventSocket)
      : undefined);
  reconcileEvent(eventId, { isStageScreenSharing: reader }).catch((err) => {
    logger.error({ eventId, err }, '[agoraRecording] Reconciliation failed');
  });
}

/** One scheduler pass: every active recordable event plus every event with a live task. */
async function reconcileAll(options = {}) {
  const result = await db.execute({
    sql: `SELECT id FROM events
          WHERE status = 'active' AND recording_enabled = 1
            AND provider = 'agora' AND format = 'live'
          UNION
          SELECT DISTINCT event_id AS id FROM event_recordings
          WHERE status IN ('starting', 'recording', 'stopping')`,
    args: [],
  });
  for (const row of result.rows) {
    try {
      await reconcileEvent(row.id, options);
    } catch (err) {
      logger.error({ eventId: row.id, err }, '[agoraRecording] Reconciliation failed');
    }
  }
}

// ---------------------------------------------------------------------------
// Retention rule check (startup, production)
// ---------------------------------------------------------------------------

/** A lifecycle rule that deletes everything under eventos/ within the retention. */
function isRetentionRule(rule) {
  if (!rule || rule.Status !== 'Enabled') return false;
  const days = rule.Expiration?.Days;
  if (!Number.isInteger(days) || days > RECORDING_RETENTION_DAYS) return false;
  const filter = rule.Filter || {};
  // A tag or size filter narrows the rule to some objects only.
  if (filter.Tag || (filter.And && Array.isArray(filter.And.Tags) && filter.And.Tags.length)) return false;
  if (filter.ObjectSizeGreaterThan !== undefined || filter.ObjectSizeLessThan !== undefined) return false;
  if (filter.And && (filter.And.ObjectSizeGreaterThan !== undefined || filter.And.ObjectSizeLessThan !== undefined)) return false;
  const prefix = filter.Prefix ?? filter.And?.Prefix ?? rule.Prefix ?? '';
  return `${RECORDING_PREFIX_ROOT}/`.startsWith(prefix);
}

/**
 * The 30-day retention is a legal promise kept by the bucket, and a console
 * setting nobody re-reads is exactly the kind of silent gap this project
 * refuses. Where the app has read credentials, check the rule at startup and
 * be loud if it is missing. It never blocks recording.
 */
async function checkRetentionRule({ getLifecycleRules } = {}) {
  if (!recordingEnabled() || !downloadsAvailable()) return { checked: false, ok: null };
  const storage = storageSettings();
  const reader = getLifecycleRules || require('./s3Service').getLifecycleRules;
  let rules;
  try {
    rules = await reader({ bucket: storage.bucket, region: storage.region });
  } catch (err) {
    await raiseAlert('retention_rule_missing', 'retention_rule_missing', {
      detail: `No se pudo leer la configuración de ciclo de vida del bucket ${storage.bucket}.`,
      err,
    });
    return { checked: true, ok: false };
  }
  const ok = Array.isArray(rules) && rules.some(isRetentionRule);
  if (!ok) {
    await raiseAlert('retention_rule_missing', 'retention_rule_missing', {
      detail: `El bucket ${storage.bucket} no tiene una regla activa que elimine ${RECORDING_PREFIX_ROOT}/ en ${RECORDING_RETENTION_DAYS} días o menos. Las grabaciones se conservarían más de lo que dice la política de privacidad.`,
    });
  }
  return { checked: true, ok };
}

module.exports = {
  // constants
  RECORDING_MAX_MINUTES,
  RECORDING_RETENTION_DAYS,
  RECORDING_MAX_ATTEMPTS,
  RECORDING_RETRY_COOLDOWN_SECONDS,
  RECORDING_QUERY_GRACE_SECONDS,
  RECORDING_STALE_SECONDS,
  RECORDING_MAX_IDLE_SECONDS,
  RECORDER_TOKEN_MARGIN_SECONDS,
  RECORDING_PREFIX_ROOT,
  // pure builders
  mixLayoutFor,
  buildFileNamePrefix,
  s3PrefixFor,
  buildStorageConfig,
  buildRecordingConfig,
  buildStartClientRequest,
  buildAcquireBody,
  recorderTokenTtlSeconds,
  recorderUidFor,
  availableUntilFor,
  isRetentionRule,
  // runtime
  recordingEnabled,
  downloadsAvailable,
  storageSettings,
  reconcileEvent,
  triggerReconcile,
  reconcileAll,
  checkRetentionRule,
  // test seam
  __configureForTests,
  __resetForTests,
};
