/**
 * Test events (openspec change: event-video-cdn-delivery).
 *
 * A production dry run must not tell a single newsletter subscriber about the
 * event, nor show it to the public. Two points carry that:
 *
 *   · marketingEmailService.buildEvent — the only builder of the event
 *     announcement, reached by both admin hooks (create and update). Under
 *     test the Resend transport is a no-op, so the builder itself is asserted:
 *     it is what decides whether there is anything to send.
 *   · eventService.getEventsByDateRange — the public calendar, which feeds
 *     /live and the sitemap. getEventBySlug must NOT filter: the tester's
 *     direct link has to work.
 */

const bcrypt = require('bcrypt')
const crypto = require('crypto')
const { db } = require('../config/database')
const eventService = require('../services/eventService')
const { buildEvent } = require('../services/marketingEmailService')

let hostId

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10)
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', 'Paula Prueba')",
    args: [`testmode-host-${Date.now()}@test.com`, hash],
  })
  hostId = Number(host.lastInsertRowid)
})

const createEvent = (isTest, extra = {}) => eventService.createEvent({
  title: `Evento ${crypto.randomUUID().slice(0, 8)}`,
  event_datetime: '2032-03-15 19:00:00',
  host_user_id: hostId,
  category: 'charla',
  status: 'scheduled',
  is_test: isTest,
  ...extra,
})

describe('the announcement builder', () => {
  test('builds the announcement for a real scheduled event', async () => {
    const event = await createEvent(0)
    const built = await buildEvent(event.id)
    expect(built).not.toBeNull()
    expect(built.subject).toContain(event.title)
  })

  test('builds nothing for the same event marked as a test', async () => {
    const event = await createEvent(1)
    expect(await buildEvent(event.id)).toBeNull()
  })

  test('a test event converted into a real one becomes announceable', async () => {
    const event = await createEvent(1)
    await eventService.updateEvent(event.id, { is_test: 0 })
    expect(await buildEvent(event.id)).not.toBeNull()
  })
})

describe('public visibility', () => {
  test('the calendar leaves test events out and keeps real ones', async () => {
    const real = await createEvent(0)
    const test = await createEvent(1)

    const listed = (await eventService.getEventsByDateRange('2032-03-01', '2032-03-31')).map((e) => e.id)

    expect(listed).toContain(real.id)
    expect(listed).not.toContain(test.id)
  })

  test('the direct link still resolves a test event', async () => {
    const test = await createEvent(1)
    const bySlug = await eventService.getEventBySlug(test.slug)
    expect(bySlug).not.toBeNull()
    expect(bySlug.is_test).toBe(1)
  })
})
