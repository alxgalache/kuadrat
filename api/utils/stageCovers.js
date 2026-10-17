/**
 * Stage covers of an Agora broadcast (change: agora-stage-covers): a still
 * image over the whole stage before the start, in a break or at the end, with
 * nobody in front of it. `client/lib/stageCovers.js` is the client's mirror —
 * same ids, same files — and the two change together.
 *
 * The images are JPGs in client/public, served from CLIENT_URL: the browsers
 * paint them over the stage, and Agora Cloud Recording downloads the same URL
 * as the composite canvas background (it documents JPG and BMP, not PNG).
 * A published file is never overwritten: a new design ships as the next `-vN`
 * and the two catalogues move to it. In use: `-v2`, the dark version of the
 * designs (docs/cortinillas/oscura/, sources in docs/cortinillas/html/). The
 * white `-v1` blended into the white page and stays published, unused.
 */

const config = require('../config/env');

const STAGE_COVERS = Object.freeze({
  inicio: Object.freeze({ file: 'cortinillas/inicio-v2.jpg', headline: 'Empezamos en breve' }),
  intermedio: Object.freeze({ file: 'cortinillas/intermedio-v2.jpg', headline: 'Volvemos enseguida' }),
  final: Object.freeze({ file: 'cortinillas/final-v2.jpg', headline: 'Gracias por acompañarnos' }),
});

// The recording canvas background when no cover is up. Every layout sent to
// Agora carries an explicit backgroundImage, this one or a cover, so a cover
// can never linger on the canvas whether updateLayout replaces or merges.
const STAGE_COVER_RECORDING_BLANK = 'grabacion/fondo-negro-v1.jpg';

function isStageCover(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(STAGE_COVERS, id);
}

/** Public URL of a file of this catalogue. */
function stageCoverPublicUrl(file) {
  return `${String(config.clientUrl).replace(/\/+$/, '')}/${file}`;
}

/**
 * Covers exist only on the stage of an Agora broadcast: a meeting has a grid
 * and an individual recording, LiveKit has neither stage nor recording, and a
 * video pass plays a file.
 */
function supportsStageCovers(event) {
  return !!event
    && event.provider === 'agora'
    && event.interaction_mode === 'broadcast'
    && event.format === 'live';
}

module.exports = {
  STAGE_COVERS,
  STAGE_COVER_RECORDING_BLANK,
  isStageCover,
  stageCoverPublicUrl,
  supportsStageCovers,
};
