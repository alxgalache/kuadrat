/**
 * Starting a /live event (change: event-auto-start).
 *
 * `startEvent` is the ONLY way an event starts: the «Iniciar» button
 * (eventAdminController.startEvent) and the auto-start scheduler both call it,
 * so a step added to the start — the «Inicio» stage cover, say — reaches both.
 * Two copies of these steps would be two truths that drift, the mistake
 * zoneResolver documents.
 *
 * The scheduled → active transition is guarded (eventService.startEvent), so
 * when the button and the scheduler race, exactly one of them announces the
 * start and reconciles the recording. The steps before it are harmless to
 * repeat: measuring a video twice writes the same value, and the LiveKit room
 * is always named `event-<id>`.
 *
 * `startDueEvents` starts every scheduled event whose own interval —
 * event_datetime to event_datetime + duration_minutes, Madrid wall time read
 * by utils/eventTime.js — contains `now`. Never before, and never after it
 * ends: a forgotten event from last week does not start on a deploy. A start
 * that keeps failing two minutes past its time alerts once, on three channels.
 */

const config = require('../config/env');
const logger = require('../config/logger');
const eventService = require('./eventService');
const livekitService = require('./livekitService');
const videoDurationService = require('./videoDurationService');
const agoraRecordingService = require('./agoraRecordingService');
const emailService = require('./emailService');
const { eventStartUtc, eventEndUtc } = require('../utils/eventTime');
const { supportsStageCovers } = require('../utils/stageCovers');

const AUTO_START_ALERT_AFTER_MS = 2 * 60 * 1000;
const MAX_DETAIL_LENGTH = 300;

/**
 * Start one event, exactly as «Iniciar» always did.
 *
 * @param {string} eventId
 * @param {object} [options]
 * @param {object|null} [options.eventSocket] - app.get('eventSocket')
 * @param {'manual'|'auto'} [options.source]
 * @param {number} [options.now] - Instant of the start (video_started_at)
 * @returns {Promise<{ result: 'started'|'not_found'|'not_scheduled'|'room_failed', event: object|null, error?: Error }>}
 */
async function startEvent(eventId, { eventSocket = null, source = 'manual', now = Date.now() } = {}) {
  const current = await eventService.getEventById(eventId);
  if (!current) return { result: 'not_found', event: null };
  if (current.status !== 'scheduled') return { result: 'not_scheduled', event: current };

  let transition;
  if (current.format === 'video') {
    // The duration times the chat closing: measure it now if it is still
    // missing (the video may have been uploaded after the event was saved)
    if (current.video_url && !current.video_duration_seconds) {
      await videoDurationService.refreshVideoDurationSafely(eventId);
    }
    // Video format: store the start timestamp, no LiveKit room needed
    transition = await eventService.startEvent(eventId, { videoStartedAt: new Date(now).toISOString() });
  } else if (current.provider === 'agora') {
    // Agora channels are implicit — no external call, just fix the name
    transition = await eventService.startEvent(eventId, { agoraChannelName: `event-${current.id}` });
  } else {
    // Live format: create LiveKit room
    const roomName = `event-${current.id}`;
    try {
      await livekitService.createRoom(roomName, {
        maxParticipants: current.max_attendees || 0,
      });
    } catch (err) {
      logger.error({ err, eventId, source }, 'Error creating LiveKit room');
      // The other path may have started it meanwhile: not a failure then.
      const latest = await eventService.getEventById(eventId);
      if (latest && latest.status !== 'scheduled') return { result: 'not_scheduled', event: latest };
      return { result: 'room_failed', event: current, error: err };
    }
    transition = await eventService.startEvent(eventId, { livekitRoomName: roomName });
  }

  // Lost the race: whoever changed the row announces it.
  if (!transition.changed) return { result: 'not_scheduled', event: transition.event };

  // A broadcast opens on the «Inicio» cover (agora-stage-covers): whoever
  // arrives before the host sees «Empezamos en breve», and the host's first
  // camera takes it down. Before event_started and the reconciliation, so the
  // first recording task already starts with the cover as its canvas.
  if (eventSocket && supportsStageCovers(current)) {
    eventSocket.setStageCover(eventId, 'inicio');
  }

  // Notify clients waiting on the event detail page
  if (eventSocket) {
    eventSocket.broadcastEventStarted(eventId);
  }

  // Cloud recording (agora-event-recording): start it now rather than on the
  // next reconciler pass. Never awaited — the event must not wait for Agora —
  // and a no-op unless the event is recordable and recording is configured.
  agoraRecordingService.triggerReconcile(eventId, { eventSocket });

  return { result: 'started', event: transition.event };
}

/**
 * Whether `now` falls inside the event's own interval:
 * [event_datetime, event_datetime + duration_minutes). False when unreadable.
 */
function isAutoStartDue(event, now = Date.now()) {
  const start = eventStartUtc(event);
  const end = eventEndUtc(event);
  if (!start || !end) return false;
  return start.getTime() <= now && now < end.getTime();
}

function describeError(err) {
  return String(err?.message || err || 'Error desconocido').slice(0, MAX_DETAIL_LENGTH);
}

// Events already alerted, in memory: an api restart may alert once more.
const alerted = new Set();

/** log + Sentry + email to BUSINESS_EMAIL, once per event. Never throws. */
async function raiseAutoStartAlert(event, scheduledAt, detail, err) {
  if (alerted.has(event.id)) return;
  alerted.add(event.id);

  logger.error(
    { eventId: event.id, scheduledAt: scheduledAt.toISOString(), detail },
    '[eventAutoStart] Event could not be started automatically'
  );

  // Lazily and never under test: requiring @sentry/node installs global
  // require hooks that break unrelated Jest suites (see dbBackupService).
  if (config.nodeEnv !== 'test') {
    try {
      const Sentry = require('../instrument.js');
      Sentry.captureException(err || new Error('Event auto-start failed'), {
        tags: { job: 'event_auto_start' },
        extra: { eventId: event.id, detail },
      });
    } catch (sentryErr) {
      logger.warn({ err: sentryErr }, '[eventAutoStart] Could not report the alert to Sentry');
    }
  }

  try {
    await emailService.sendEventAutoStartAlertEmail({
      eventTitle: event.title || null,
      eventId: event.id,
      scheduledAt: scheduledAt.toISOString(),
      detail,
    });
  } catch (mailErr) {
    logger.error({ err: mailErr }, '[eventAutoStart] Could not send the alert email');
  }
}

/**
 * One scheduler pass: start every scheduled event that is due.
 * @param {object} [options]
 * @param {object|null} [options.eventSocket]
 * @param {number} [options.now]
 * @returns {Promise<string[]>} ids of the events started in this pass
 */
async function startDueEvents({ eventSocket = null, now = Date.now() } = {}) {
  const started = [];
  const events = await eventService.listScheduledEvents();
  for (const event of events) {
    if (!isAutoStartDue(event, now)) continue;
    const scheduledAt = eventStartUtc(event);

    let outcome;
    try {
      outcome = await startEvent(event.id, { eventSocket, source: 'auto', now });
    } catch (err) {
      logger.error({ err, eventId: event.id }, '[eventAutoStart] Start threw');
      outcome = { result: 'error', error: err };
    }

    if (outcome.result === 'started') {
      started.push(event.id);
      logger.info({
        eventId: event.id,
        source: 'auto',
        scheduledAt: scheduledAt.toISOString(),
        startedAt: new Date(now).toISOString(),
        delayMs: now - scheduledAt.getTime(),
      }, '[eventAutoStart] Event started at its scheduled time');
      continue;
    }

    if (outcome.result === 'room_failed' || outcome.result === 'error') {
      const detail = describeError(outcome.error);
      logger.warn({ eventId: event.id, result: outcome.result, detail }, '[eventAutoStart] Start failed; retrying on the next pass');
      if (now >= scheduledAt.getTime() + AUTO_START_ALERT_AFTER_MS) {
        await raiseAutoStartAlert(event, scheduledAt, detail, outcome.error);
      }
    }
  }
  return started;
}

module.exports = {
  AUTO_START_ALERT_AFTER_MS,
  startEvent,
  isAutoStartDue,
  startDueEvents,
};
