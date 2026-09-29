/**
 * The authenticated Socket.IO room for pre-recorded video passes
 * (openspec change: live-event-access-hardening).
 *
 * A visitor with no registration saw the room of a video pass and chatted in
 * it as «Anónimo»: the page decided from browser state, and the video chat
 * travelled over the PUBLIC room with whatever name the socket sent. The pass
 * now joins the same authenticated room as Agora events, and the page waits
 * for its ACK. Same recording fake `io` as eventSocketCohost.test.js — the api
 * has no socket.io-client, and none is added.
 */

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { randomUUID } = require('crypto')
const { db } = require('../config/database')
const { createVerifiedAttendee } = require('./helpers/eventAttendees')
const setupEventSocket = require('../socket/eventSocket')

const MIN = 60 * 1000
const stamp = Date.now()
let hostId

function createFakeServer() {
  let onConnection = null
  const broadcasts = []
  const io = {
    on: (name, handler) => { if (name === 'connection') onConnection = handler },
    to: (room) => ({ emit: (event, payload) => broadcasts.push({ room, event, payload }) }),
  }
  setupEventSocket(io)
  let counter = 0
  const connect = () => {
    const handlers = {}
    const socket = {
      id: `socket-${++counter}`,
      data: {},
      handshake: { headers: {}, address: '127.0.0.1' },
      received: [],
      on: (name, handler) => { handlers[name] = handler },
      emit: (event, payload) => socket.received.push({ event, payload }),
      join: () => {},
      leave: () => {},
      to: (room) => ({ emit: (event, payload) => broadcasts.push({ room, event, payload }) }),
    }
    onConnection(socket)
    socket.handlers = handlers
    socket.joinRoom = (payload) => new Promise((resolve) => handlers.join_event_room(payload, resolve))
    socket.send = (name, payload) => handlers[name](payload)
    return socket
  }
  return { broadcasts, connect }
}

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10)
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', 'Hugo Host')",
    args: [`pass-room-host-${stamp}@test.com`, hash],
  })
  hostId = Number(host.lastInsertRowid)
})

async function createPass({ startedAgoMs = 1 * MIN, durationSeconds = 600 } = {}) {
  const id = randomUUID()
  await db.execute({
    sql: `INSERT INTO events (id, title, slug, event_datetime, host_user_id, category, status, format,
            content_type, video_url, duration_minutes, video_duration_seconds)
          VALUES (?, ?, ?, ?, ?, 'video', 'scheduled', 'video', 'video', 'https://otro-host.example/v.mp4', 45, ?)`,
    args: [id, `Pase ${id.slice(0, 8)}`, `pase-sala-${id.slice(0, 8)}`, new Date().toISOString(), hostId, durationSeconds],
  })
  const session = await createVerifiedAttendee(id, {
    first_name: 'Vera', last_name: 'Verificada', email: `pase-sala-${id.slice(0, 8)}@test.com`,
  })
  await db.execute({
    sql: "UPDATE events SET status = 'active', video_started_at = ? WHERE id = ?",
    args: [new Date(Date.now() - startedAgoMs).toISOString(), id],
  })
  return { eventId: id, attendeeId: session.attendee.id, accessToken: session.accessToken }
}

describe('join_event_room for a video pass', () => {
  it('admits a verified attendee', async () => {
    const pass = await createPass()
    const socket = createFakeServer().connect()
    const ack = await socket.joinRoom(pass)
    expect(ack.ok).toBe(true)
    expect(ack.identity).toBe(`viewer-${pass.attendeeId}`)
  })

  it('refuses a visitor without credentials, or with someone else\'s', async () => {
    const pass = await createPass()
    const socket = createFakeServer().connect()
    expect((await socket.joinRoom({ eventId: pass.eventId })).ok).toBe(false)
    expect((await socket.joinRoom({ eventId: pass.eventId, attendeeId: pass.attendeeId, accessToken: 'x'.repeat(64) })).ok).toBe(false)
  })

  it('refuses an expired host JWT (a stale `user` in the browser)', async () => {
    const pass = await createPass()
    const expired = jwt.sign({ id: hostId, role: 'seller', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET)
    const ack = await createFakeServer().connect().joinRoom({ eventId: pass.eventId, hostToken: expired })
    expect(ack.ok).toBe(false)
  })

  it('refuses everyone once the chat has closed', async () => {
    const pass = await createPass({ startedAgoMs: 16 * MIN, durationSeconds: 600 })
    const ack = await createFakeServer().connect().joinRoom(pass)
    expect(ack.ok).toBe(false)
    expect(ack.reason).toBe('El evento ha finalizado')
  })
})

describe('video pass chat', () => {
  it('carries the name of the registration, set by the server', async () => {
    const pass = await createPass()
    const { connect, broadcasts } = createFakeServer()
    const socket = connect()
    await socket.joinRoom(pass)

    await socket.send('event_chat_message', { text: 'Hola' })

    const sent = broadcasts.find((b) => b.event === 'event_chat_message')
    expect(sent.room).toBe(`event-room-${pass.eventId}`)
    expect(sent.payload.name).toBe('Vera Verificada')
    expect(sent.payload.message).toBe('Hola')
  })

  it('a socket that never joined cannot chat', async () => {
    const pass = await createPass()
    const { connect, broadcasts } = createFakeServer()
    const socket = connect()
    await socket.send('event_chat_message', { text: 'Hola', eventId: pass.eventId })
    expect(broadcasts.filter((b) => b.event === 'event_chat_message')).toHaveLength(0)
  })

  it('the public, unauthenticated `chat_message` handler is gone', () => {
    const socket = createFakeServer().connect()
    expect(socket.handlers.chat_message).toBeUndefined()
  })
})
