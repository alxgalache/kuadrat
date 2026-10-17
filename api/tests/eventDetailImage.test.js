/**
 * The detail-page image of an event (`events.detail_image_url`), beside the
 * list image (`cover_image_url`). Both are optional and independent: the admin
 * may give the same URL twice, two different ones (the list card is a wide
 * strip, the detail page a square), or only one — then each view falls back to
 * the other (client/lib/eventImages.js, api/utils/eventCoverImage.js).
 *
 * The write path crosses the same four places as the host flags — the two Zod
 * schemas, the `INSERT` of `eventService.createEvent` and the `allowedFields`
 * of `updateEvent` — and missing one fails silently: the form saves, the API
 * answers 200 and nothing is stored. Hence the behavioural tests and, below,
 * a structural guard that names the missing place.
 *
 * Nothing here reaches the network: `.env.test` points the libsql client at a
 * local file and `config/database.js` aborts the process if it ever doesn't.
 */

const fs = require('fs')
const path = require('path')
const { db } = require('../config/database')
const eventService = require('../services/eventService')
const eventAdminController = require('../controllers/eventAdminController')
const { createEventSchema, updateEventSchema } = require('../validators/eventSchemas')

const LIST_URL = 'https://cdn.140d.art/eventos/lista.jpg'
const DETAIL_URL = 'https://cdn.140d.art/eventos/ficha.jpg'

// --- fixtures -------------------------------------------------------------

async function insertHost() {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible)
          VALUES (?, 'x', 'seller', 'Artista de Prueba', 1)`,
    args: [`detailimage-${Date.now()}-${Math.random()}@example.com`],
  })
  return Number(result.lastInsertRowid)
}

function eventPayload(hostUserId, extra = {}) {
  return {
    title: 'Charla con dos imágenes',
    event_datetime: '2026-10-01 18:00:00',
    host_user_id: hostUserId,
    category: 'charla',
    format: 'live',
    ...extra,
  }
}

/** The controller only reads `req.body` and `req.params`. */
async function callController(handler, { body = {}, params = {} } = {}) {
  let payload = null
  const res = {
    status() { return this },
    json(value) { payload = value; return this },
  }
  const next = (err) => { throw err }
  await handler({ body, params }, res, next)
  return payload
}

// --- behaviour ------------------------------------------------------------

describe('events.detail_image_url', () => {
  test('is optional: an event without it is created with NULL', async () => {
    const hostUserId = await insertHost()
    const payload = await callController(eventAdminController.createEvent, {
      body: eventPayload(hostUserId, { cover_image_url: LIST_URL }),
    })

    expect(payload.success).toBe(true)
    expect(payload.event.cover_image_url).toBe(LIST_URL)
    expect(payload.event.detail_image_url).toBeNull()
  })

  test('an empty value from the form is stored as NULL, like the list image', async () => {
    const hostUserId = await insertHost()
    const payload = await callController(eventAdminController.createEvent, {
      body: eventPayload(hostUserId, { cover_image_url: '', detail_image_url: '' }),
    })

    expect(payload.event.cover_image_url).toBeNull()
    expect(payload.event.detail_image_url).toBeNull()
  })

  test('persists on create, independent of the list image, and survives a re-read', async () => {
    const hostUserId = await insertHost()
    const payload = await callController(eventAdminController.createEvent, {
      body: eventPayload(hostUserId, { cover_image_url: LIST_URL, detail_image_url: DETAIL_URL }),
    })

    expect(payload.event.cover_image_url).toBe(LIST_URL)
    expect(payload.event.detail_image_url).toBe(DETAIL_URL)

    // The public detail page reads through getEventBySlug (`e.*`).
    const reread = await eventService.getEventBySlug(payload.event.slug)
    expect(reread.detail_image_url).toBe(DETAIL_URL)
  })

  test('the same URL may be given for both views', async () => {
    const hostUserId = await insertHost()
    const payload = await callController(eventAdminController.createEvent, {
      body: eventPayload(hostUserId, { cover_image_url: LIST_URL, detail_image_url: LIST_URL }),
    })

    expect(payload.event.cover_image_url).toBe(LIST_URL)
    expect(payload.event.detail_image_url).toBe(LIST_URL)
  })

  test('updates and clears without touching the list image', async () => {
    const hostUserId = await insertHost()
    const created = await eventService.createEvent(
      eventPayload(hostUserId, { cover_image_url: LIST_URL })
    )

    const set = await callController(eventAdminController.updateEvent, {
      params: { id: created.id },
      body: { detail_image_url: DETAIL_URL },
    })
    expect(set.event.detail_image_url).toBe(DETAIL_URL)
    expect(set.event.cover_image_url).toBe(LIST_URL)

    // The edit form sends `form.detail_image_url || null` when emptied.
    const cleared = await callController(eventAdminController.updateEvent, {
      params: { id: created.id },
      body: { detail_image_url: null },
    })
    expect(cleared.event.detail_image_url).toBeNull()
    expect(cleared.event.cover_image_url).toBe(LIST_URL)
  })

  test('a PUT that omits the field leaves it untouched', async () => {
    const hostUserId = await insertHost()
    const created = await eventService.createEvent(
      eventPayload(hostUserId, { detail_image_url: DETAIL_URL })
    )

    const payload = await callController(eventAdminController.updateEvent, {
      params: { id: created.id },
      body: { title: 'Otro título' },
    })
    expect(payload.event.detail_image_url).toBe(DETAIL_URL)
  })

  test('the reminder scheduler reads it, for the email fallback', async () => {
    const hostUserId = await insertHost()
    const created = await eventService.createEvent(
      eventPayload(hostUserId, { status: 'scheduled', detail_image_url: DETAIL_URL })
    )

    const rows = await eventService.listScheduledEvents()
    const row = rows.find((r) => r.id === created.id)
    expect(row.detail_image_url).toBe(DETAIL_URL)
  })

  test('survives both Zod schemas, which strip anything undeclared', () => {
    const created = createEventSchema.parse({
      body: eventPayload(1, { detail_image_url: DETAIL_URL }),
    })
    expect(created.body.detail_image_url).toBe(DETAIL_URL)

    const updated = updateEventSchema.parse({ body: { detail_image_url: null } })
    expect(updated.body).toHaveProperty('detail_image_url', null)
  })
})

// --- structural guard over the four-place write path ----------------------

describe('the write path keeps all four places in step for detail_image_url', () => {
  const serviceSource = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'eventService.js'), 'utf8'
  )

  test('the column is in the INSERT of createEvent', () => {
    const insert = serviceSource.slice(
      serviceSource.indexOf('INSERT INTO events'),
      serviceSource.indexOf('async function updateEvent')
    )
    expect(insert).toContain('detail_image_url')
  })

  test('the column is in allowedFields of updateEvent', () => {
    const update = serviceSource.slice(serviceSource.indexOf('async function updateEvent'))
    const allowed = update.slice(
      update.indexOf('const allowedFields'),
      update.indexOf('const setClauses')
    )
    expect(allowed).toContain('detail_image_url')
  })

  test('the column is declared in both Zod schemas', () => {
    const schemaSource = fs.readFileSync(
      path.join(__dirname, '..', 'validators', 'eventSchemas.js'), 'utf8'
    )
    expect(schemaSource.split('detail_image_url:').length - 1).toBe(2)
  })
})
