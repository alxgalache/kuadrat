const cron = require('node-cron');
const config = require('../config/env');
const logger = require('../config/logger');
const { startDueEvents } = require('../services/eventStartService');

/**
 * Starts scheduled events at their time (change: event-auto-start), doing
 * exactly what «Iniciar» does — both go through eventStartService.startEvent.
 * Every 30 s, like the auction scheduler: an event starts at most 30 s late.
 * Passes never overlap: a slow LiveKit room creation must not stack them.
 *
 * Started from server.js only, which tests never import, and only with
 * EVENT_AUTO_START_ENABLED (production and staging): the local api points at
 * the preproduction database and must not start its events from a developer's
 * machine. Two processes on the same database never start an event twice —
 * the transition is guarded.
 */
module.exports = function startEventStartScheduler(app) {
  if (!config.events.autoStartSchedulerEnabled) {
    logger.info('[eventStartScheduler] EVENT_AUTO_START_ENABLED not set — scheduler not started');
    return null;
  }

  let running = false;
  const task = cron.schedule('*/30 * * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const eventSocket = app && typeof app.get === 'function' ? app.get('eventSocket') : null;
      await startDueEvents({ eventSocket });
    } catch (err) {
      logger.error({ err }, '[eventStartScheduler] Auto-start pass failed');
    } finally {
      running = false;
    }
  });
  logger.info('[eventStartScheduler] Event auto-start scheduled every 30 s');
  return task;
};
