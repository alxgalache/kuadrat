/**
 * Duration of an MP4 read from its `mvhd` box (change:
 * live-event-access-hardening), without downloading the file.
 *
 * Walks the top-level boxes through `readRange` until it meets `moov`, so it
 * works whether the index sits at the start (faststart, what
 * scripts/video/optimizar-video.mjs produces) or after `mdat`. Each step reads
 * a box header (16 bytes); only the start of `moov` is read in full, where
 * `mvhd` is its first child in every encoder in use.
 *
 * mvhd, after its box header:
 *   v0: version(1) flags(3) creation(4) modification(4) timescale(4) duration(4)
 *   v1: version(1) flags(3) creation(8) modification(8) timescale(4) duration(8)
 */

const MOOV_READ_BYTES = 64 * 1024;
const MAX_TOP_LEVEL_BOXES = 32;

function boxHeader(buffer, pos) {
  if (pos + 8 > buffer.length) return null;
  let size = buffer.readUInt32BE(pos);
  const type = buffer.toString('latin1', pos + 4, pos + 8);
  let headerLength = 8;
  if (size === 1) {
    if (pos + 16 > buffer.length) return null;
    size = Number(buffer.readBigUInt64BE(pos + 8));
    headerLength = 16;
  }
  return { size, type, headerLength };
}

/** Seconds from the `mvhd` child of a `moov` payload, or null. */
function durationFromMoov(moovPayload) {
  let pos = 0;
  while (pos + 8 <= moovPayload.length) {
    const box = boxHeader(moovPayload, pos);
    if (!box) return null;
    if (box.type === 'mvhd') {
      const b = pos + box.headerLength;
      if (b + 1 > moovPayload.length) return null;
      const version = moovPayload.readUInt8(b);
      let timescale;
      let duration;
      if (version === 1) {
        if (b + 32 > moovPayload.length) return null;
        timescale = moovPayload.readUInt32BE(b + 20);
        duration = Number(moovPayload.readBigUInt64BE(b + 24));
      } else {
        if (b + 20 > moovPayload.length) return null;
        timescale = moovPayload.readUInt32BE(b + 12);
        duration = moovPayload.readUInt32BE(b + 16);
      }
      if (!timescale || !duration) return null;
      return duration / timescale;
    }
    if (box.size < box.headerLength) return null;
    pos += box.size;
  }
  return null;
}

/**
 * @param {(start: number, length: number) => Promise<Buffer>} readRange
 *   Up to `length` bytes from `start` (fewer, or none, past the end).
 * @returns {Promise<number|null>} Duration in seconds, or null if it cannot be read.
 */
async function readMp4Duration(readRange) {
  let offset = 0;
  for (let i = 0; i < MAX_TOP_LEVEL_BOXES; i += 1) {
    const header = await readRange(offset, 16);
    const box = boxHeader(header, 0);
    if (!box) return null;
    if (box.type === 'moov') {
      const payload = await readRange(offset + box.headerLength, MOOV_READ_BYTES);
      return durationFromMoov(payload);
    }
    // size 0 = "to the end of the file": nothing after it can be moov
    if (box.size === 0 || box.size < box.headerLength) return null;
    offset += box.size;
  }
  return null;
}

module.exports = { readMp4Duration, durationFromMoov };
