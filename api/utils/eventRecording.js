/**
 * The ONE place the server decides whether an event may be recorded with
 * Agora Cloud Recording, and in which mode (change: agora-event-recording).
 * `client/lib/eventRecording.js` is its mirror for the admin form and the
 * in-room notice; the two must agree, the same way `sellerCapabilities` does.
 *
 * `recording_enabled` is stored whatever the provider or format — like the
 * host flags — and only has effect here. That is why the reconciler, the
 * in-room badge and the pre-access notice all go through this predicate
 * instead of reading the column.
 */

function isRecordingEligible(event) {
  if (!event) return false;
  return Number(event.recording_enabled) === 1
    && event.provider === 'agora'
    && event.format === 'live';
}

/**
 * The recording mode is never chosen by anyone: it follows the interaction
 * mode. A broadcast is recorded as ONE composite video (`mix`) with every
 * published camera and screen plus the mixed audio of everyone; a meeting as
 * one audio and one video track per uid (`individual`).
 */
function recordingModeFor(event) {
  return event && event.interaction_mode === 'meeting' ? 'individual' : 'mix';
}

module.exports = { isRecordingEligible, recordingModeFor };
