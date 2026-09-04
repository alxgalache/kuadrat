/**
 * `events.allow_mobile_host_console` — the per-event switch that gives the host
 * the three mobile view modes (openspec change: agora-host-mobile-broadcast-modes).
 *
 * Worth a regression test because the failure mode is silent in both
 * directions. The write path crosses four places — the two Zod schemas, the
 * `INSERT` column list in `eventService.createEvent`, and the `allowedFields`
 * whitelist in `eventService.updateEvent` — and missing ANY of them leaves the
 * admin panel with a checkbox that ticks, saves, returns 200 and stores
 * nothing. `updateEventSchema` even calls `.strip()`, so an undeclared field is
 * removed before the controller ever sees it.
 *
 * The read path needs no test: `getEventBySlug` selects `e.*`.
 *
 * Nothing here reaches the network. `.env.test` points the libsql client at a
 * local file and `config/database.js` aborts the process if it ever doesn't.
 */

const { db } = require('../config/database')
const eventService = require('../services/eventService')
const eventAdminController = require('../controllers/eventAdminController')
const { createEventSchema, updateEventSchema } = require('../validators/eventSchemas')

// --- fixtures -------------------------------------------------------------

async function insertHost() {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible)
          VALUES (?, 'x', 'seller', 'Artista de Prueba', 1)`,
    args: [`mobileconsole-${Date.now()}-${Math.random()}@example.com`],
  })
  return Number(result.lastInsertRowid)
}

function eventPayload(hostUserId, extra = {}) {
  return {
    title: 'Conferencia de prueba',
    event_datetime: '2026-10-01 18:00:00',
    host_user_id: hostUserId,
    category: 'charla',
    format: 'live',
    provider: 'agora',
    interaction_mode: 'broadcast',
    ...extra,
  }
}

/**
 * Drive the controller directly with a plain object standing in for the Express
 * request: it only reads `req.body` and `req.params`. The Zod layer is
 * exercised separately below, since in production it runs as route middleware.
 */
async function callController(handler, { body = {}, params = {} } = {}) {
  let payload = null
  let statusCode = null
  const res = {
    status(code) { statusCode = code; return this },
    json(value) { payload = value; return this },
  }
  const next = (err) => { throw err }
  await handler({ body, params }, res, next)
  return { statusCode, payload }
}

// --- tests ----------------------------------------------------------------

describe('events.allow_mobile_host_console', () => {
  test('defaults to 0 when the field is not sent', async () => {
    const hostUserId = await insertHost()

    const { payload } = await callController(eventAdminController.createEvent, {
      body: eventPayload(hostUserId),
    })

    expect(payload.success).toBe(true)
    expect(payload.event.allow_mobile_host_console).toBe(0)
  })

  test('persists on create and survives a re-read', async () => {
    const hostUserId = await insertHost()

    const { payload } = await callController(eventAdminController.createEvent, {
      body: eventPayload(hostUserId, { allow_mobile_host_console: true }),
    })

    expect(payload.event.allow_mobile_host_console).toBe(1)

    // Re-read through the same path the live page uses.
    const reread = await eventService.getEventById(payload.event.id)
    expect(reread.allow_mobile_host_console).toBe(1)
  })

  test('updates in both directions', async () => {
    const hostUserId = await insertHost()
    const created = await eventService.createEvent(
      eventPayload(hostUserId, { allow_mobile_host_console: 0 })
    )

    const on = await callController(eventAdminController.updateEvent, {
      params: { id: created.id },
      body: { allow_mobile_host_console: true },
    })
    expect(on.payload.event.allow_mobile_host_console).toBe(1)

    const off = await callController(eventAdminController.updateEvent, {
      params: { id: created.id },
      body: { allow_mobile_host_console: false },
    })
    expect(off.payload.event.allow_mobile_host_console).toBe(0)
  })

  test('a PUT that omits the field leaves it untouched', async () => {
    const hostUserId = await insertHost()
    const created = await eventService.createEvent(
      eventPayload(hostUserId, { allow_mobile_host_console: 1 })
    )

    // The edit form only sends the field in the supported provider/mode
    // combination; omitting it must not read as "turn it off".
    const { payload } = await callController(eventAdminController.updateEvent, {
      params: { id: created.id },
      body: { title: 'Otro título' },
    })

    expect(payload.event.allow_mobile_host_console).toBe(1)
  })

  test('the boolean survives both Zod schemas, which strip anything undeclared', async () => {
    const hostUserId = await insertHost()

    const created = createEventSchema.parse({
      body: eventPayload(hostUserId, { allow_mobile_host_console: true }),
    })
    expect(created.body.allow_mobile_host_console).toBe(true)

    // SQLite hands the edit form a 0/1; it must not be rejected on the way back.
    const updated = updateEventSchema.parse({ body: { allow_mobile_host_console: 1 } })
    expect(updated.body.allow_mobile_host_console).toBe(1)
  })

  test('an invalid value is rejected by Zod, before the database', async () => {
    const hostUserId = await insertHost()

    expect(() => createEventSchema.parse({
      body: eventPayload(hostUserId, { allow_mobile_host_console: 'quizá' }),
    })).toThrow()

    expect(() => updateEventSchema.parse({
      body: { allow_mobile_host_console: 7 },
    })).toThrow()
  })
})

/**
 * Structural guard over the four-place write path. A behavioural test above
 * already fails if a place is missing, but this names WHICH one, which is the
 * difference between a five-minute fix and an afternoon.
 */
describe('the write path keeps all four places in step', () => {
  const fs = require('fs')
  const path = require('path')
  const serviceSource = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'eventService.js'), 'utf8'
  )

  test('the column is in the INSERT of createEvent', () => {
    const insert = serviceSource.slice(
      serviceSource.indexOf('INSERT INTO events'),
      serviceSource.indexOf('async function updateEvent')
    )
    expect(insert).toContain('allow_mobile_host_console')
  })

  test('the column is in allowedFields of updateEvent', () => {
    const update = serviceSource.slice(serviceSource.indexOf('async function updateEvent'))
    const allowed = update.slice(
      update.indexOf('const allowedFields'),
      update.indexOf('const setClauses')
    )
    expect(allowed).toContain('allow_mobile_host_console')
  })

  test('the column is declared in both Zod schemas', () => {
    const schemaSource = fs.readFileSync(
      path.join(__dirname, '..', 'validators', 'eventSchemas.js'), 'utf8'
    )
    const occurrences = schemaSource.split('allow_mobile_host_console:').length - 1
    expect(occurrences).toBe(2)
  })
})
