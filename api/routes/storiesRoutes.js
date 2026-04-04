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
