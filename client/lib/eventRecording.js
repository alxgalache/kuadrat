/**
 * Client mirror of `api/utils/eventRecording.js` (agora-event-recording): the
 * ONE place the client decides whether an event is recorded. The admin form,
 * the in-room «Grabando» badge and the pre-access notice all go through it;
 * `recording_enabled` is stored for any provider and only has effect here.
 */

/** The provider/format combination Agora Cloud Recording supports. */
export function supportsRecording({ provider, format } = {}) {
  return provider === 'agora' && format === 'live'
}

/** Mirror of the server's isRecordingEligible. */
export function isEventRecorded(event) {
  return !!event && Number(event.recording_enabled) === 1 && supportsRecording(event)
}

/** The in-room badge: a recorded event while it is live. */
export function isRecordingBadgeVisible(event) {
  return isEventRecorded(event) && event.status === 'active'
}

/** broadcast → one composite video; meeting → one track per participant. */
export function isPerParticipantRecording(event) {
  return !!event && event.interaction_mode === 'meeting'
}

/**
 * AWS CLI command to download a recording folder (a meeting's tracks are
 * thousands of files that only make sense together, so they are never
 * downloaded through the web). With `uid`, only that participant's tracks.
 */
export function awsSyncCommand({ bucket, prefix, folder, uid = null }) {
  const base = `aws s3 sync "s3://${bucket}/${prefix}" "./${folder}"`
  return uid === null || uid === undefined
    ? base
    : `${base} --exclude "*" --include "*__uid_s_${uid}__*"`
}

/** Human-readable size, es-ES. */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toLocaleString('es-ES', { maximumFractionDigits: 1 })} ${units[unit]}`
}
