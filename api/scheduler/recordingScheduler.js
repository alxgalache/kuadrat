const cron = require('node-cron');
const config = require('../config/env');
const logger = require('../config/logger');
const agoraRecordingService = require('../services/agoraRecordingService');

/**
 * Agora Cloud Recording reconciler (change: agora-event-recording).
 *
 * Every 30 s, converge every active recordable event — and every event that
 * still has a live task — on what the database says. This pass is the
 * authority: the lifecycle endpoints only call the same reconciliation
 * earlier, so an end-of-event path that forgets to is still stopped here
 * within 30 s. Passes never overlap: a slow Agora gateway must not stack them.
 *
 * Started from server.js only, which tests never import, and only when
 * recording is configured (never under NODE_ENV=test).
 */
module.exports = function startRecordingScheduler(app) {
  if (!config.recording.enabled) {
    logger.info('[recordingScheduler] Agora Cloud Recording not configured — scheduler not started');
    return null;
  }

  // The socket presence is the only source of the stage screen's state (host
  // or co-presenter sharing on uid 2). Read it through the app on every call:
  // never copied.
  const isStageScreenSharing = (eventId) => {
    const eventSocket = app && typeof app.get === 'function' ? app.get('eventSocket') : null;
    return !!(eventSocket && typeof eventSocket.isStageScreenSharing === 'function'
      && eventSocket.isStageScreenSharing(eventId));
  };

  // The 30-day retention is kept by the bucket's lifecycle rule; check it once
  // per start where the app can read it (production). Never blocks recording.
  agoraRecordingService.checkRetentionRule().catch((err) => {
    logger.error({ err }, '[recordingScheduler] Retention rule check failed');
  });

  let running = false;
  const task = cron.schedule('*/30 * * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await agoraRecordingService.reconcileAll({ isStageScreenSharing });
    } catch (err) {
      logger.error({ err }, '[recordingScheduler] Reconciliation pass failed');
    } finally {
      running = false;
    }
  });

  logger.info('[recordingScheduler] Agora Cloud Recording reconciler scheduled every 30 s');
  return task;
};
