/**
 * Events start on their own at their time (change: event-auto-start).
 *
 * Pins the one start path shared by «Iniciar» and the scheduler, its guarded
 * transition (button and scheduler racing start an event once), which events
 * the scheduler starts and when — inside their own interval, read as Madrid
 * wall time — and what a failure does: retry, then one alert. LiveKit, the
 * recording reconciler and the video probe are spied: nothing leaves the
 * process.
 *
 * startDueEvents reads every scheduled event in the shared test database, so
 * each event here lives in its own week of 2033: no other suite's event and no
 * other test's event is ever due at the instants these tests use.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const config = require('../config/env');
const { db } = require('../config/database');
const emailService = require('../services/emailService');
const livekitService = require('../services/livekitService');
const agoraRecordingService = require('../services/agoraRecordingService');
const videoDurationService = require('../services/videoDurationService');
const {
  AUTO_START_ALERT_AFTER_MS, startEvent, isAutoStartDue, startDueEvents,
} = require('../services/eventStartService');
const { eventStartUtc } = require('../utils/eventTime');

const stamp = Date.now();
let hostId;
let adminToken;
let week = 0;
let reconcile;

/** A 19:00 Madrid wall time in its own week of 2033. */
function nextWallTime() {
  const day = new Date(Date.UTC(2033, 0, 3 + 7 * week++));
  return `${day.toISOString().slice(0, 10)}T19:00`;
}

async function createEvent({
  status = 'scheduled', provider = 'agora', format = 'live', interactionMode = 'broadcast',
  eventDatetime = nextWallTime(),
} = {}) {
  const id = randomUUID();
  const title = `Inicio ${id.slice(0, 8)}`;
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, duration_minutes, host_user_id, access_type,
             category, status, provider, format, interaction_mode)
          VALUES (?, ?, ?, ?, 60, ?, 'free', 'charla', ?, ?, ?, ?)`,
    args: [id, title, `inicio-${id.slice(0, 8)}`, eventDatetime, hostId, status, provider, format, interactionMode],
  });
  const start = eventStartUtc({ event_datetime: eventDatetime }).getTime();
  return { id, title, start, end: start + 60 * 60 * 1000 };
}

async function eventRow(id) {
  const result = await db.execute({
    sql: 'SELECT status, agora_channel_name, livekit_room_name, video_started_at FROM events WHERE id = ?',
    args: [id],
  });
  return result.rows[0];
}

const fakeSocket = () => ({ broadcastEventStarted: jest.fn(), setStageCover: jest.fn() });
const startedCalls = (socket, id) => socket.broadcastEventStarted.mock.calls.filter(([e]) => e === id).length;
const reconcileCalls = (id) => reconcile.mock.calls.filter(([e]) => e === id).length;
const alertsFor = (title) => emailService.__getOutbox()
  .filter((m) => m.subject.includes('no ha podido iniciarse automáticamente') && m.subject.includes(title));

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [`autostart-host${stamp}@test.com`, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);
  const adminEmail = `autostart-admin${stamp}@test.com`;
  const admin = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'admin', ?)",
    args: [adminEmail, hash, 'Ada Admin'],
  });
  adminToken = jwt.sign({ id: Number(admin.lastInsertRowid), email: adminEmail, role: 'admin' },
    process.env.JWT_SECRET, { expiresIn: '1h' });
});

beforeEach(() => {
  emailService.__clearOutbox();
  reconcile = jest.spyOn(agoraRecordingService, 'triggerReconcile').mockImplementation(() => {});
  jest.spyOn(videoDurationService, 'refreshVideoDurationSafely').mockResolvedValue(undefined);
  jest.spyOn(livekitService, 'createRoom').mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------

describe('scheduler switch', () => {
  it('stays off under test although .env.test asks for it', () => {
    expect(process.env.EVENT_AUTO_START_ENABLED).toBe('true');
    expect(config.events.autoStartSchedulerEnabled).toBe(false);
  });

  it('does not start the scheduler when off', () => {
    const startEventStartScheduler = require('../scheduler/eventStartScheduler');
    expect(startEventStartScheduler(app)).toBeNull();
  });
});

describe('isAutoStartDue', () => {
  const at = (iso) => Date.parse(iso);
  const summer = { event_datetime: '2026-07-10T19:00', duration_minutes: 60 }; // 17:00–18:00 UTC
  const winter = { event_datetime: '2026-12-10T19:00', duration_minutes: 60 }; // 18:00–19:00 UTC

  it('is due inside the event interval, read as Madrid wall time', () => {
    expect(isAutoStartDue(summer, at('2026-07-10T16:59:59Z'))).toBe(false);
    expect(isAutoStartDue(summer, at('2026-07-10T17:00:10Z'))).toBe(true);
    expect(isAutoStartDue(summer, at('2026-07-10T18:00:00Z'))).toBe(false);
    // Read as UTC, the event would still be "due" two hours late.
    expect(isAutoStartDue(summer, at('2026-07-10T19:00:10Z'))).toBe(false);
  });

  it('applies the winter offset', () => {
    expect(isAutoStartDue(winter, at('2026-12-10T17:59:59Z'))).toBe(false);
    expect(isAutoStartDue(winter, at('2026-12-10T18:00:00Z'))).toBe(true);
    expect(isAutoStartDue(winter, at('2026-12-10T18:59:59Z'))).toBe(true);
    expect(isAutoStartDue(winter, at('2026-12-10T19:00:00Z'))).toBe(false);
  });

  it('uses 60 minutes when the duration is missing, and the duration otherwise', () => {
    expect(isAutoStartDue({ event_datetime: '2026-12-10T19:00' }, at('2026-12-10T18:59:59Z'))).toBe(true);
    expect(isAutoStartDue({ event_datetime: '2026-12-10T19:00' }, at('2026-12-10T19:00:00Z'))).toBe(false);
    expect(isAutoStartDue({ event_datetime: '2026-12-10T19:00', duration_minutes: 90 }, at('2026-12-10T19:29:59Z'))).toBe(true);
  });

  it('is never due for an unreadable date', () => {
    expect(isAutoStartDue({ event_datetime: 'nope' }, at('2026-12-10T18:30:00Z'))).toBe(false);
    expect(isAutoStartDue({ event_datetime: null }, at('2026-12-10T18:30:00Z'))).toBe(false);
  });
});

describe('startDueEvents', () => {
  it('starts a due Agora event exactly as «Iniciar» does', async () => {
    const event = await createEvent();
    const socket = fakeSocket();

    const started = await startDueEvents({ eventSocket: socket, now: event.start + 10_000 });

    expect(started).toEqual([event.id]);
    const row = await eventRow(event.id);
    expect(row.status).toBe('active');
    expect(row.agora_channel_name).toBe(`event-${event.id}`);
    expect(startedCalls(socket, event.id)).toBe(1);
    expect(reconcileCalls(event.id)).toBe(1);
  });

  it('starts a due LiveKit event with its room', async () => {
    const event = await createEvent({ provider: 'livekit' });

    await startDueEvents({ eventSocket: fakeSocket(), now: event.start + 10_000 });

    expect(livekitService.createRoom).toHaveBeenCalledWith(`event-${event.id}`, expect.any(Object));
    const row = await eventRow(event.id);
    expect(row.status).toBe('active');
    expect(row.livekit_room_name).toBe(`event-${event.id}`);
  });

  it('starts a video pass from the instant of the pass', async () => {
    const event = await createEvent({ format: 'video' });
    const now = event.start + 10_000;

    await startDueEvents({ eventSocket: fakeSocket(), now });

    const row = await eventRow(event.id);
    expect(row.status).toBe('active');
    expect(row.video_started_at).toBe(new Date(now).toISOString());
  });

  it('leaves alone an event before its time and one whose interval is over', async () => {
    const early = await createEvent();
    const late = await createEvent();
    const socket = fakeSocket();

    await startDueEvents({ eventSocket: socket, now: early.start - 1 });
    await startDueEvents({ eventSocket: socket, now: late.end });

    expect((await eventRow(early.id)).status).toBe('scheduled');
    expect((await eventRow(late.id)).status).toBe('scheduled');
    expect(socket.broadcastEventStarted).not.toHaveBeenCalled();
  });

  it.each(['draft', 'cancelled'])('never starts a %s event', async (status) => {
    const event = await createEvent({ status });
    const socket = fakeSocket();

    await startDueEvents({ eventSocket: socket, now: event.start + 10_000 });

    expect((await eventRow(event.id)).status).toBe(status);
    expect(socket.broadcastEventStarted).not.toHaveBeenCalled();
  });
});

describe('the «Inicio» stage cover (agora-stage-covers)', () => {
  // The real room module behind a recording fake io: the start must leave the
  // cover in the state the join ACK and the recording read.
  const realRoom = () => {
    const io = { on: () => {}, to: () => ({ emit: () => {} }) };
    return require('../socket/eventSocket')(io);
  };

  it('a broadcast starts on «inicio», before event_started', async () => {
    const event = await createEvent();
    const room = realRoom();
    const order = [];
    const socket = {
      setStageCover: (id, cover) => { order.push('cover'); room.setStageCover(id, cover); },
      broadcastEventStarted: () => order.push('started'),
      getStageState: (id) => room.getStageState(id),
    };

    await startEvent(event.id, { eventSocket: socket });

    expect(room.getStageState(event.id).cover).toBe('inicio');
    expect(order).toEqual(['cover', 'started']);
  });

  it.each([
    ['a meeting', { interactionMode: 'meeting' }],
    ['a LiveKit event', { provider: 'livekit' }],
    ['a video pass', { format: 'video' }],
  ])('%s starts with no cover', async (_label, options) => {
    const event = await createEvent(options);
    const socket = fakeSocket();

    const { result } = await startEvent(event.id, { eventSocket: socket });

    expect(result).toBe('started');
    expect(socket.setStageCover).not.toHaveBeenCalled();
  });
});

describe('the guarded transition', () => {
  it('starts an event once when the button and the scheduler race', async () => {
    const event = await createEvent();
    const socket = fakeSocket();

    const results = await Promise.all([
      startEvent(event.id, { eventSocket: socket, source: 'manual' }),
      startEvent(event.id, { eventSocket: socket, source: 'auto' }),
    ]);

    expect(results.map((r) => r.result).sort()).toEqual(['not_scheduled', 'started']);
    expect(startedCalls(socket, event.id)).toBe(1);
    expect(reconcileCalls(event.id)).toBe(1);
  });
});

describe('failures', () => {
  it('keeps a failed LiveKit start scheduled and starts it on the next pass, without alerting', async () => {
    const event = await createEvent({ provider: 'livekit' });
    livekitService.createRoom.mockRejectedValueOnce(new Error('twirp error: unavailable'));

    await startDueEvents({ eventSocket: fakeSocket(), now: event.start + 10_000 });
    expect((await eventRow(event.id)).status).toBe('scheduled');

    await startDueEvents({ eventSocket: fakeSocket(), now: event.start + 40_000 });
    expect((await eventRow(event.id)).status).toBe('active');
    expect(alertsFor(event.title)).toHaveLength(0);
  });

  it('alerts exactly once when the start keeps failing two minutes past its time', async () => {
    const event = await createEvent({ provider: 'livekit' });
    livekitService.createRoom.mockRejectedValue(new Error('twirp error: unavailable'));

    for (const offset of [10_000, 60_000, AUTO_START_ALERT_AFTER_MS + 5_000, AUTO_START_ALERT_AFTER_MS + 35_000, 10 * 60_000]) {
      await startDueEvents({ eventSocket: fakeSocket(), now: event.start + offset });
    }

    expect((await eventRow(event.id)).status).toBe('scheduled');
    const alerts = alertsFor(event.title);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].to).toBe(config.business.email);
    expect(alerts[0].html).toContain('twirp error: unavailable');
    // The admin link is escaped like the recording alert's (each / as &#x2F;).
    expect(alerts[0].html).toContain(event.id);
  });

  it('a failing event does not stop another due in the same pass', async () => {
    const eventDatetime = nextWallTime();
    const failing = await createEvent({ provider: 'livekit', eventDatetime });
    const fine = await createEvent({ provider: 'livekit', eventDatetime });
    livekitService.createRoom.mockImplementation(async (roomName) => {
      if (roomName === `event-${failing.id}`) throw new Error('room refused');
      return {};
    });

    await startDueEvents({ eventSocket: fakeSocket(), now: fine.start + 10_000 });

    expect((await eventRow(failing.id)).status).toBe('scheduled');
    expect((await eventRow(fine.id)).status).toBe('active');
  });
});

describe('POST /api/admin/events/:id/start keeps its contract', () => {
  const start = (id) => request(app)
    .post(`/api/admin/events/${id}/start`)
    .set('Authorization', `Bearer ${adminToken}`);

  it('200 with the event for a scheduled one', async () => {
    const event = await createEvent();
    const res = await start(event.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe('Evento iniciado');
    expect(res.body.event.status).toBe('active');
  });

  it('400 with the same text for an event that is not scheduled', async () => {
    const event = await createEvent({ status: 'active' });
    const res = await start(event.id);
    expect(res.statusCode).toBe(400);
    expect(res.body.title).toBe('No se puede iniciar');
    expect(res.body.message).toBe('Solo se pueden iniciar eventos programados');
  });

  it('404 for an event that does not exist', async () => {
    const res = await start(randomUUID());
    expect(res.statusCode).toBe(404);
  });

  it('500 when the LiveKit room cannot be created', async () => {
    const event = await createEvent({ provider: 'livekit' });
    livekitService.createRoom.mockRejectedValueOnce(new Error('room refused'));
    const res = await start(event.id);
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe('No se pudo crear la sala de streaming');
    expect((await eventRow(event.id)).status).toBe('scheduled');
  });
});
