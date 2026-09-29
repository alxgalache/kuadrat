/**
 * Closing of pre-recorded video passes (change: live-event-access-hardening).
 *
 * Five minutes after the video ends the chat closes and the event finishes for
 * everyone, exactly as when the admin presses «Finalizar» on a video event:
 * status `finished`, `finished_at`, and `event_ended` on the public room, which
 * every open page turns into the «Evento finalizado» modal. From then on
 * nobody gets the video (/video-token) or enters the room (join_event_room).
 *
 * The timetable comes from utils/videoPass.js, the same instants the clients
 * count down to. Idempotent with a manual end at the same moment: endEvent
 * keeps the first finished_at.
 */

const logger = require('../config/logger');
const eventService = require('./eventService');
const { isPassClosed, chatClosesAt } = require('../utils/videoPass');

/**
 * @param {object} options
 * @param {object|null} options.eventSocket  The Socket.IO event handler (app.get('eventSocket'))
 * @param {number} [options.now]
 * @returns {Promise<string[]>} ids of the events finished in this pass
 */
async function closeExpiredVideoPasses({ eventSocket = null, now = Date.now() } = {}) {
  const finished = [];
  const events = await eventService.listActiveVideoEvents();
  for (const event of events) {
    if (!isPassClosed(event, now)) continue;
    await eventService.endEvent(event.id);
    if (eventSocket) eventSocket.broadcastEventEnded(event.id);
    finished.push(event.id);
    logger.info({
      eventId: event.id,
      chatClosedAt: new Date(chatClosesAt(event)).toISOString(),
      measuredDuration: event.video_duration_seconds ?? null,
    }, 'Video pass closed: chat grace over, event finished');
  }
  return finished;
}

module.exports = { closeExpiredVideoPasses };
