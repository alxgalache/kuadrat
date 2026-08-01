/**
 * GET /api/stories/videos — graceful degradation when S3 is not configured
 * (openspec change sentry-noise-cleanup).
 *
 * The endpoint must tell two situations apart that used to collapse into the
 * same 500:
 *   - S3 not configured  -> expected environment state (staging is self-hosted
 *                           with no AWS credentials). 200 with an empty list,
 *                           no error reported.
 *   - S3 configured but broken -> a real incident. 500, reported as before.
 */

const request = require('supertest');
const { app } = require('./helpers/app');
const config = require('../config/env');
const s3Service = require('../services/s3Service');

describe('GET /api/stories/videos', () => {
  const originalUseS3 = config.useS3;

  afterEach(() => {
    config.useS3 = originalUseS3;
    jest.restoreAllMocks();
  });

  describe('when S3 is not configured', () => {
    beforeEach(() => {
      config.useS3 = false;
    });

    it('responds 200 with an empty video list', async () => {
      const res = await request(app).get('/api/stories/videos');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, videos: [] });
    });

    it('never reaches the S3 client', async () => {
      const listFiles = jest.spyOn(s3Service, 'listFiles');

      await request(app).get('/api/stories/videos');

      expect(listFiles).not.toHaveBeenCalled();
    });
  });

  describe('when S3 is configured', () => {
    beforeEach(() => {
      config.useS3 = true;
    });

    it('responds 500 when the S3 call fails', async () => {
      jest
        .spyOn(s3Service, 'listFiles')
        .mockRejectedValue(new Error('NoSuchBucket: the bucket does not exist'));

      const res = await request(app).get('/api/stories/videos');

      expect(res.status).toBe(500);
    });

    it('responds 200 with the listed videos on success', async () => {
      jest
        .spyOn(s3Service, 'listFiles')
        .mockResolvedValue(['one.mp4', 'notes.txt', 'two.webm']);

      const res = await request(app).get('/api/stories/videos');

      expect(res.status).toBe(200);
      // Non-video objects under the prefix are filtered out.
      expect(res.body.videos.map(v => v.filename)).toEqual([
        'one.mp4',
        'two.webm',
      ]);
    });
  });
});
