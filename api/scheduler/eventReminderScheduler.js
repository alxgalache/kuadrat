const cron = require('node-cron');
const config = require('../config/env');
const logger = require('../config/logger');
const { sendDueReminders } = require('../services/eventReminderService');

/**
 * 48 h event reminders (change: event-reminder-email). Every 5 minutes: a
 * reminder goes out at most 5 minutes after its window opens, and a pass with
 * no event in its window costs one indexed query. Passes never overlap — a
 * large event spaces its sends over several minutes, and the next pass picks
 * up whoever is left.
 *
 * Started from server.js only, which tests never import, and only with
 * EVENT_REMINDERS_ENABLED (production and staging): the local api points at
 * the preproduction database and the real email provider, and must not email
 * preproduction attendees on its own. Staging and a local api with the flag on
 * would share that database without double-sending: every send is claimed.
 */
module.exports = function startEventReminderScheduler() {
  if (!config.events.reminderSchedulerEnabled) {
    logger.info('[eventReminderScheduler] EVENT_REMINDERS_ENABLED not set — scheduler not started');
    return null;
  }

  let running = false;
  const task = cron.schedule('*/5 * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await sendDueReminders();
    } catch (err) {
      logger.error({ err }, '[eventReminderScheduler] Reminder pass failed');
    } finally {
      running = false;
    }
  });
  logger.info('[eventReminderScheduler] Event reminders scheduled every 5 min');
  return task;
};
