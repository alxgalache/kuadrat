/**
 * Resend broadcast `name` limit.
 *
 * On 27/09/2026 the announcement of a live event with a 49-character title
 * never reached the production newsletter: Resend answered 422 "Field `name`
 * has a maximum of 70 items." because the name was built as
 * `Evento <36-char UUID> — <title>` (95 characters). The limit is documented
 * nowhere, so these tests pin it: every payload leaving sendBroadcast carries
 * a name of at most 70 characters, and a name that already fits is untouched.
 *
 * Pure functions only — nothing here builds a Resend client or reaches the
 * network.
 */

const {
  BROADCAST_NAME_MAX,
  clipBroadcastName,
  broadcastPayload,
} = require('../services/marketingEmailService')

// The exact name that failed in production.
const FAILED_PROD_NAME = 'Evento 148cee81-ceac-4375-a04d-dded5fa0d84c — Lorca, una biografía jugable del poeta granadino'

describe('clipBroadcastName', () => {
  test('the limit is 70', () => {
    expect(BROADCAST_NAME_MAX).toBe(70)
  })

  test('the name that failed in production is clipped to the limit with an ellipsis', () => {
    const clipped = clipBroadcastName(FAILED_PROD_NAME)
    expect(clipped.length).toBeLessThanOrEqual(BROADCAST_NAME_MAX)
    expect(clipped.endsWith('…')).toBe(true)
    expect(FAILED_PROD_NAME.startsWith(clipped.slice(0, -1))).toBe(true)
  })

  test('the same event under the short-id format fits whole', () => {
    const name = 'Evento 148cee81 — Lorca, una biografía jugable del poeta granadino'
    expect(clipBroadcastName(name)).toBe(name)
  })

  test('a name of exactly 70 characters is left alone', () => {
    const name = 'x'.repeat(70)
    expect(clipBroadcastName(name)).toBe(name)
  })

  test('counts characters, not bytes: 69 characters with a 3-byte em dash pass untouched', () => {
    // Accepted by Resend in production (71 bytes).
    const name = 'Evento 72719a6e-0413-42f4-a252-66fd958d8274 — prueba entrevista final'
    expect(name.length).toBe(69)
    expect(clipBroadcastName(name)).toBe(name)
  })

  test('never splits a surrogate pair and stays within 70 UTF-16 units', () => {
    const name = 'a'.repeat(68) + '🎨🎨🎨'
    const clipped = clipBroadcastName(name)
    expect(clipped.length).toBeLessThanOrEqual(BROADCAST_NAME_MAX)
    expect(clipped).toBe('a'.repeat(68) + '…')
    expect(clipped.isWellFormed()).toBe(true)
  })

  test('does not leave a space before the ellipsis', () => {
    const name = 'x'.repeat(68) + ' ' + 'y'.repeat(10)
    expect(clipBroadcastName(name)).toBe('x'.repeat(68) + '…')
  })
})

describe('broadcastPayload', () => {
  test('clips the name and passes subject and html through intact', () => {
    const subject = 'Nuevo evento en directo: ' + 'z'.repeat(300)
    const payload = broadcastPayload({ name: FAILED_PROD_NAME, topicId: 't1', subject, html: '<p>x</p>' })
    expect(payload.name.length).toBeLessThanOrEqual(BROADCAST_NAME_MAX)
    expect(payload.subject).toBe(subject)
    expect(payload.html).toBe('<p>x</p>')
    expect(payload.topicId).toBe('t1')
    expect(payload.send).toBe(true)
  })
})
