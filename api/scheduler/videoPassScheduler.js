const cron = require('node-cron');
const logger = require('../config/logger');
const { closeExpiredVideoPasses } = require('../services/videoPassService');

/**
 * Finishes the video passes whose chat grace is over (change:
 * live-event-access-hardening). Every 15 s, so an event finishes at most 15 s
 * after the instant every participant was counting down to — and in between
 * /video-token and join_event_room already refuse. Passes never overlap.
 *
 * Started from server.js only, which tests never import. Always on: it only
 * acts on active video events past their closing instant.
 */
module.exports = function startVideoPassScheduler(app) {
  let running = false;
  const task = cron.schedule('*/15 * * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const eventSocket = app && typeof app.get === 'function' ? app.get('eventSocket') : null;
      await closeExpiredVideoPasses({ eventSocket });
    } catch (err) {
      logger.error({ err }, '[videoPassScheduler] Closing pass failed');
    } finally {
      running = false;
    }
  });
  logger.info('[videoPassScheduler] Video pass closing scheduled every 15 s');
  return task;
};
