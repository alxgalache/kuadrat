/**
 * Measures the real duration of a video event's MP4 (change:
 * live-event-access-hardening) and stores it in events.video_duration_seconds,
 * which sets when the pass ends and, five minutes later, when the chat closes
 * and the event finishes (utils/videoPass.js).
 *
 * Only the MP4 header is read (utils/mp4Duration.js), with Range requests:
 *   protected  CloudFront URL signed for 2 minutes — the api holds the key, so
 *              no AWS credentials are needed and preproduction can do it too
 *   external   the URL as is
 *   uploaded   the file on disk
 * A server that answers a Range request with 200 is aborted on the spot rather
 * than downloading the whole file. Best effort by design: any failure leaves
 * the column NULL, the timetable falls back to duration_minutes and a `warn` is
 * logged. It never blocks saving or starting an event.
 *
 * Under NODE_ENV=test the default network transport throws: tests inject their
 * own with __setFetchForTests() and never reach the network.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const logger = require('../config/logger');
const eventService = require('./eventService');
const cloudfrontSigner = require('../utils/cloudfrontSigner');
const { classifyVideoUrl } = require('../utils/eventVideoSources');
const { readMp4Duration } = require('../utils/mp4Duration');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'events');
const READ_TIMEOUT_MS = 5000;
const SIGNED_TTL_MS = 2 * 60 * 1000;

const defaultFetch = (...args) => {
  if (config.nodeEnv === 'test') {
    throw new Error('videoDurationService: network transport disabled under NODE_ENV=test');
  }
  return fetch(...args);
};
let fetchImpl = defaultFetch;

function httpRangeReader(url) {
  return async (start, length) => {
    const res = await fetchImpl(url, {
      headers: { Range: `bytes=${start}-${start + length - 1}` },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    if (res.status === 206) return Buffer.from(await res.arrayBuffer());
    if (res.status === 416) return Buffer.alloc(0); // past the end of the file
    // A 200 would stream the whole file: stop it right here
    try { await res.body?.cancel(); } catch { /* already closed */ }
    throw new Error(`Range request answered ${res.status}`);
  };
}

function fileRangeReader(filePath) {
  return async (start, length) => {
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  };
}

/** Seconds of the MP4 at `videoUrl`, or null if it cannot be measured. */
async function measureVideoDuration(videoUrl) {
  const kind = classifyVideoUrl(videoUrl);
  let reader;
  if (kind === 'uploaded') {
    const filename = videoUrl.replace('uploaded:', '');
    if (!/^[A-Za-z0-9_-]+\.(mp4|mov)$/i.test(filename)) return null;
    reader = fileRangeReader(path.join(UPLOADS_DIR, filename));
  } else if (kind === 'protected') {
    if (!cloudfrontSigner.isConfigured()) return null;
    reader = httpRangeReader(cloudfrontSigner.signUrl(videoUrl, { expiresAt: Date.now() + SIGNED_TTL_MS }));
  } else if (kind === 'external') {
    reader = httpRangeReader(videoUrl);
  } else {
    return null;
  }
  const seconds = await readMp4Duration(reader);
  return seconds && Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) / 1000 : null;
}

/**
 * Measure the event's MP4 and store the result (NULL on failure, so a stale
 * duration from a previous URL never survives a change of video).
 * @returns {Promise<number|null>}
 */
async function refreshVideoDuration(eventId) {
  const event = await eventService.getEventById(eventId);
  if (!event || event.format !== 'video' || !event.video_url) return null;
  let seconds = null;
  try {
    seconds = await measureVideoDuration(event.video_url);
    if (seconds === null) logger.warn({ eventId }, 'Video duration could not be read; the pass falls back to duration_minutes');
  } catch (err) {
    // Never the URL: a signed one is a working download link
    logger.warn({ eventId, err: err.message }, 'Video duration measurement failed; the pass falls back to duration_minutes');
  }
  await eventService.setVideoDuration(eventId, seconds);
  return seconds;
}

/**
 * refreshVideoDuration with an overall deadline and no exceptions: for the
 * request paths (save, start, upload), which must never wait long or fail
 * because of it.
 */
async function refreshVideoDurationSafely(eventId, timeoutMs = 8000) {
  let timer;
  try {
    return await Promise.race([
      refreshVideoDuration(eventId),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
  } catch (err) {
    logger.warn({ eventId, err: err.message }, 'Video duration refresh failed');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function __setFetchForTests(fn) {
  if (config.nodeEnv !== 'test') {
    throw new Error('__setFetchForTests is only available under NODE_ENV=test');
  }
  fetchImpl = fn || defaultFetch;
}

module.exports = {
  measureVideoDuration,
  refreshVideoDuration,
  refreshVideoDurationSafely,
  __setFetchForTests,
};
