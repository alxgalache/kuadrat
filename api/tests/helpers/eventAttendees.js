/**
 * A verified event attendee with a working access token, for suites that need
 * a participant but are not about registration.
 *
 * Since enforce-verification-gates, `eventService.registerAttendee` issues no
 * credential: the token is born in verifyEmailCode, the proof of email
 * ownership. This helper walks the same real path — register, send the code,
 * verify it — rather than writing `email_verified = 1` by hand, so a suite
 * built on it breaks if that path breaks.
 *
 * The code comes back from sendVerificationCode itself; no email is involved
 * (and under NODE_ENV=test none could leave the process anyway).
 *
 * @returns {Promise<{ attendee: object, accessToken: string }>}
 */
const eventService = require('../../services/eventService');

async function createVerifiedAttendee(eventId, { first_name, last_name, email }) {
  const { attendee } = await eventService.registerAttendee(eventId, { first_name, last_name, email });

  const sent = await eventService.sendVerificationCode(eventId, attendee.id);
  if (!sent?.code) {
    throw new Error(`createVerifiedAttendee: no code was issued for ${email}`);
  }

  const verified = await eventService.verifyEmailCode(eventId, attendee.id, sent.code);
  if (!verified.valid) {
    throw new Error(`createVerifiedAttendee: verification failed (${verified.reason}) for ${email}`);
  }

  return { attendee: verified.attendee, accessToken: verified.accessToken };
}

module.exports = { createVerifiedAttendee };
