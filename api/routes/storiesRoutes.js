const express = require('express');
const router = express.Router();
const config = require('../config/env');
const logger = require('../config/logger');
const s3Service = require('../services/s3Service');
const { sendSuccess } = require('../utils/response');
const { cacheControl } = require('../middleware/cache');

/**
 * GET /api/stories/videos
 * List story videos from S3. Returns array of { filename, url }.
 */
router.get('/videos', cacheControl({ maxAge: 3600 }), async (req, res, next) => {
  try {
    // S3 not configured is an EXPECTED environment state, not an incident:
    // staging is self-hosted with no AWS credentials by decision, and the
    // homepage video is decorative (the client's fetchStoryVideos already
    // falls back to an empty list). Letting getClient() throw here produced
    // 1414 Sentry events for a non-event. A real S3 failure — bucket
    // configured but unreachable, bad credentials — still falls through to
    // the catch below and is reported.
    //
    // Guarded on config.useS3 rather than wrapped in a try/catch on purpose: a
    // catch would collapse "not configured" back into "broken", which is the
    // very distinction this guard introduces. The throw inside
    // s3Service.getClient() stays as it is — product image uploads and the
    // database backups depend on that failure being loud.
    if (!config.useS3) {
      logger.warn('S3 is not configured (AWS_S3_BUCKET missing); serving an empty story video list');
      return sendSuccess(res, { videos: [] });
    }

    const filenames = await s3Service.listFiles('stories/');

    const videos = filenames
      .filter(name => name.endsWith('.mp4') || name.endsWith('.webm'))
      .map(filename => ({
        filename,
        url: config.cdnBaseUrl
          ? `${config.cdnBaseUrl}/stories/${encodeURIComponent(filename)}`
          : `https://${config.aws.s3Bucket}.s3.${config.aws.s3Region}.amazonaws.com/stories/${encodeURIComponent(filename)}`,
      }));

    sendSuccess(res, { videos });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
