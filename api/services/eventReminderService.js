/**
 * 48 h reminder of /live events (change: event-reminder-email).
 *
 * Every pass decides, from the database as it is now, who is owed a reminder
 * and writes the email with the event's current data — which is why this is a
 * scheduler of our own and not a send scheduled in Resend at registration:
 * that email would carry a date frozen at registration and would have to be
 * cancelled one by one on a postponement.
 *
 *   - Window: [start − 48 h, start), start read with utils/eventTime.js (wall
 *     time of Madrid), and only while the event is `scheduled`. A pass after
 *     downtime still sends; nothing goes out once the event starts.
 *   - Recipients: eventService.listReminderRecipients (seat holders with a
 *     password issued before the reminder instant), minus payment owed
 *     (requiresPayment) and event bans (isEmailBanned), one per email.
 *   - At most once: each attendee is claimed with a guarded UPDATE before the
 *     send, released if it fails, and given up after three attempts. A crash
 *     between claim and send loses that one reminder rather than repeating a
 *     whole event's on restart.
 *   - Sends are sequential and spaced to stay under Resend's per-second limit,
 *     and always through sendMail (inert under test).
 *
 * Logs carry ids and counts only, never an email address or a password.
 */

const logger = require('../config/logger');
const eventService = require('./eventService');
const emailService = require('./emailService');
const { eventStartUtc } = require('../utils/eventTime');
const { normalizeEmail } = require('../utils/emailOtp');

const EVENT_REMINDER_LEAD_HOURS = 48;
const EVENT_REMINDER_SEND_INTERVAL_MS = 600;
const LEAD_MS = EVENT_REMINDER_LEAD_HOURS * 60 * 60 * 1000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether `now` falls in [start − 48 h, start). False when the date is unreadable. */
function isReminderDue(event, now = Date.now()) {
  const start = eventStartUtc(event);
  if (!start) return false;
  const startMs = start.getTime();
  return now >= startMs - LEAD_MS && now < startMs;
}

/** 'YYYY-MM-DD HH:MM:SS' in UTC — the format CURRENT_TIMESTAMP writes. */
function toSqliteTimestamp(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Send the reminders one event still owes.
 * @returns {Promise<{ sent: number, failed: number, gaveUp: number }>}
 */
async function remindEvent(event, { sendIntervalMs, sleep }) {
  const reminderInstant = new Date(eventStartUtc(event).getTime() - LEAD_MS);
  const candidates = await eventService.listReminderRecipients(event.id, toSqliteTimestamp(reminderInstant));

  const counts = { sent: 0, failed: 0, gaveUp: 0 };
  const seenEmails = new Set();
  let sentOne = false;

  for (const attendee of candidates) {
    try {
      if (eventService.requiresPayment(event, attendee)) continue;
      if (await eventService.isEmailBanned(event.id, attendee.email)) continue;

      const email = normalizeEmail(attendee.email);
      if (seenEmails.has(email)) {
        // A second row with the same address: mark it covered without
        // sending, or on the next pass it would be "first" and send again.
        await eventService.claimReminder(attendee.id);
        continue;
      }
      seenEmails.add(email);

      if (!(await eventService.claimReminder(attendee.id))) continue; // another pass has it

      if (sentOne && sendIntervalMs > 0) await sleep(sendIntervalMs);
      sentOne = true;

      const result = await emailService.sendEventReminderEmail({
        email: attendee.email,
        firstName: attendee.first_name,
        event,
        accessPassword: attendee.access_password,
      });
      if (result.success) {
        counts.sent += 1;
        continue;
      }

      counts.failed += 1;
      await eventService.releaseReminder(attendee.id);
      if (Number(attendee.reminder_attempts) + 1 >= eventService.EVENT_REMINDER_MAX_ATTEMPTS) {
        counts.gaveUp += 1;
        logger.error(
          { eventId: event.id, attendeeId: attendee.id, attempts: eventService.EVENT_REMINDER_MAX_ATTEMPTS },
          '[eventReminder] Reminder abandoned after its last attempt'
        );
      }
    } catch (err) {
      counts.failed += 1;
      logger.error({ err, eventId: event.id, attendeeId: attendee.id }, '[eventReminder] Reminder failed');
    }
  }
  return counts;
}

/**
 * One pass: every scheduled event inside its reminder window.
 * @param {object} [options]
 * @param {number} [options.now]
 * @param {number} [options.sendIntervalMs] - Pause between sends (0 in tests)
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @returns {Promise<Array<{ eventId: string, sent: number, failed: number, gaveUp: number }>>}
 */
async function sendDueReminders({
  now = Date.now(),
  sendIntervalMs = EVENT_REMINDER_SEND_INTERVAL_MS,
  sleep = defaultSleep,
} = {}) {
  const summary = [];
  const events = await eventService.listScheduledEvents();
  for (const event of events) {
    if (!isReminderDue(event, now)) continue;
    try {
      const counts = await remindEvent(event, { sendIntervalMs, sleep });
      summary.push({ eventId: event.id, ...counts });
      if (counts.sent || counts.failed) {
        logger.info({ eventId: event.id, ...counts }, '[eventReminder] Reminders sent');
      }
    } catch (err) {
      logger.error({ err, eventId: event.id }, '[eventReminder] Reminder pass failed for event');
    }
  }
  return summary;
}

module.exports = {
  EVENT_REMINDER_LEAD_HOURS,
  EVENT_REMINDER_SEND_INTERVAL_MS,
  isReminderDue,
  sendDueReminders,
};
