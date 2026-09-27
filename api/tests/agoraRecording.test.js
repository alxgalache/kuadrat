/**
 * Agora Cloud Recording (openspec change: agora-event-recording).
 *
 * Nothing here reaches the network. `config.recording.enabled` is false under
 * test whatever .env.test says; each test enables the service through its
 * explicit seam, `__configureForTests`, with a fake Agora transport that
 * records every call and a clock the test moves by hand. The reconciler runs
 * unmodified against the local test database.
 */

const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const logger = require('../config/logger');
const emailService = require('../services/emailService');
const agoraService = require('../services/agoraService');
const svc = require('../services/agoraRecordingService');
const setupEventSocket = require('../socket/eventSocket');
const { isRecordingEligible, recordingModeFor } = require('../utils/eventRecording');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'super-secret-recording-key-xyz';
const ACCESS_KEY = 'AKIATESTACCESSKEY0001';
const STORAGE = Object.freeze({
  bucket: 'test-recordings',
  region: 'eu-west-1',
  regionCode: 4,
  accessKey: ACCESS_KEY,
  secretKey: SECRET_KEY,
});
const T0 = Date.parse('2026-10-01T18:00:00Z');
const MINUTE = 60 * 1000;

let hostId;
let clock;
let tokenSpy;

// --- fake Agora --------------------------------------------------------------

function createFakeAgora() {
  const calls = [];
  let counter = 0;
  const handlers = {
    acquire: () => ({ status: 200, body: { resourceId: `res-${++counter}` } }),
    start: () => ({ status: 200, body: { sid: `sid-${counter}`, resourceId: `res-${counter}` } }),
    query: () => ({ status: 200, body: { serverResponse: { status: 5 } } }),
    stop: () => ({
      status: 200,
      body: { serverResponse: { uploadingStatus: 'uploaded', fileList: [{ fileName: 'x.mp4' }] } },
    }),
    updateLayout: () => ({ status: 200, body: {} }),
  };
  const transport = async (url, init) => {
    const path = new URL(url).pathname;
    const kind = path.split('/').pop();
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ kind, method: init.method, path, body });
    const answer = await handlers[kind]({ path, body });
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      text: async () => JSON.stringify(answer.body ?? {}),
    };
  };
  const count = (kind) => calls.filter((c) => c.kind === kind).length;
  return { calls, handlers, transport, count };
}

function configure(fake, extra = {}) {
  svc.__configureForTests({
    transport: fake ? fake.transport : undefined,
    storage: STORAGE,
    now: () => clock,
    downloadsAvailable: false,
    ...extra,
  });
}

// --- fixtures ----------------------------------------------------------------

async function createEvent(overrides = {}) {
  const id = randomUUID();
  const fields = {
    status: 'active',
    provider: 'agora',
    format: 'live',
    interaction_mode: 'broadcast',
    recording_enabled: 1,
    title: 'Charla grabada',
    ...overrides,
  };
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, category,
             status, provider, format, interaction_mode, recording_enabled, agora_channel_name)
          VALUES (?, ?, ?, ?, ?, 'free', 'charla', ?, ?, ?, ?, ?, ?)`,
    args: [
      id, fields.title, `grabada-${id}`, '2026-10-01 18:00:00', hostId,
      fields.status, fields.provider, fields.format, fields.interaction_mode,
      fields.recording_enabled, `event-${id}`,
    ],
  });
  return id;
}

async function tasksOf(eventId) {
  const result = await db.execute({
    sql: 'SELECT * FROM event_recordings WHERE event_id = ? ORDER BY attempt ASC',
    args: [eventId],
  });
  return result.rows;
}

async function setEventStatus(eventId, status) {
  await db.execute({ sql: 'UPDATE events SET status = ? WHERE id = ?', args: [status, eventId] });
}

function outboxSubjects() {
  return emailService.__getOutbox().map((m) => m.subject);
}

beforeAll(async () => {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible)
          VALUES (?, 'x', 'seller', 'Helena Host', 1)`,
    args: [`recording-host-${Date.now()}@example.com`],
  });
  hostId = Number(result.lastInsertRowid);
});

beforeEach(() => {
  clock = T0;
  svc.__resetForTests();
  emailService.__clearOutbox();
  tokenSpy = jest
    .spyOn(agoraService, 'generateRtcToken')
    .mockImplementation(({ uid, ttlSeconds }) => `recorder-token-${uid}-${ttlSeconds}`);
});

afterEach(() => {
  svc.__resetForTests();
  jest.restoreAllMocks();
});

// =============================================================================
// Pure pieces
// =============================================================================

describe('eligibility and mode', () => {
  test.each([
    [{ recording_enabled: 1, provider: 'agora', format: 'live' }, true],
    [{ recording_enabled: 0, provider: 'agora', format: 'live' }, false],
    [{ recording_enabled: 1, provider: 'livekit', format: 'live' }, false],
    [{ recording_enabled: 1, provider: 'agora', format: 'video' }, false],
    [null, false],
  ])('isRecordingEligible(%j) → %s', (event, expected) => {
    expect(isRecordingEligible(event)).toBe(expected);
  });

  test('the mode follows interaction_mode and is never chosen', () => {
    expect(recordingModeFor({ interaction_mode: 'broadcast' })).toBe('mix');
    expect(recordingModeFor({ interaction_mode: 'meeting' })).toBe('individual');
  });
});

describe('request builders', () => {
  test('mixLayoutFor: adaptive without screen, vertical with the screen (uid 2) big', () => {
    expect(svc.mixLayoutFor(false)).toEqual({
      layout: 'adaptive',
      fields: { mixedVideoLayout: 1, backgroundColor: '#000000' },
    });
    expect(svc.mixLayoutFor(true)).toEqual({
      layout: 'screen',
      fields: { mixedVideoLayout: 2, maxResolutionUid: '2', backgroundColor: '#000000' },
    });
  });

  test('fileNamePrefix drops the UUID hyphens and fits in 128 characters', () => {
    const eventId = randomUUID();
    const recordingId = randomUUID();
    const parts = svc.buildFileNamePrefix(eventId, recordingId);
    expect(parts[0]).toBe('eventos');
    for (const part of parts) expect(part).toMatch(/^[A-Za-z0-9]+$/);
    expect(`${parts.join('/')}/`.length).toBeLessThanOrEqual(128);
    expect(svc.s3PrefixFor(parts)).toBe(`eventos/${eventId.replace(/-/g, '')}/${recordingId.replace(/-/g, '')}/`);
  });

  test('a broadcast is recorded as one composite MP4 of everything published', () => {
    const request = svc.buildStartClientRequest({
      mode: 'mix', token: 't', layout: svc.mixLayoutFor(false), fileNamePrefix: ['eventos', 'a', 'b'], storage: STORAGE,
    });
    expect(request.recordingConfig).toEqual({
      channelType: 1,
      streamTypes: 2,
      videoStreamType: 0,
      maxIdleTime: 1800,
      subscribeVideoUids: ['#allstream#'],
      subscribeAudioUids: ['#allstream#'],
      audioProfile: 1,
      transcodingConfig: {
        width: 1920, height: 1080, fps: 30, bitrate: 3000,
        mixedVideoLayout: 1, backgroundColor: '#000000',
      },
    });
    expect(request.recordingFileConfig).toEqual({ avFileType: ['hls', 'mp4'] });
    expect(request.storageConfig).toEqual({
      vendor: 1, region: 4, bucket: 'test-recordings',
      accessKey: ACCESS_KEY, secretKey: SECRET_KEY, fileNamePrefix: ['eventos', 'a', 'b'],
    });
  });

  test('a meeting is recorded per uid, and never asks for MP4', () => {
    const request = svc.buildStartClientRequest({
      mode: 'individual', token: 't', layout: null, fileNamePrefix: ['eventos', 'a', 'b'], storage: STORAGE,
    });
    expect(request.recordingConfig).toEqual({
      channelType: 1,
      streamTypes: 2,
      videoStreamType: 0,
      maxIdleTime: 1800,
      subscribeVideoUids: ['#allstream#'],
      subscribeAudioUids: ['#allstream#'],
      streamMode: 'standard',
      subscribeUidGroup: 4,
    });
    expect(request.recordingFileConfig.avFileType).toEqual(['hls']);
  });

  test('acquire keeps the service in Europe and mirrors the start request', () => {
    const clientRequest = svc.buildStartClientRequest({
      mode: 'mix', token: 't', layout: svc.mixLayoutFor(true), fileNamePrefix: ['eventos', 'a', 'b'], storage: STORAGE,
    });
    const body = svc.buildAcquireBody({ cname: 'event-x', uid: 3, startClientRequest: clientRequest });
    expect(body).toEqual({
      cname: 'event-x',
      uid: '3',
      clientRequest: { scene: 0, region: 'EU', resourceExpiredHour: 24, startParameter: clientRequest },
    });
  });

  test('the recorder token outlives the whole 180-minute window, never the 4 h default', () => {
    expect(svc.recorderTokenTtlSeconds(null, T0)).toBe(180 * 60 + 15 * 60);
    expect(svc.recorderTokenTtlSeconds(T0 - 60 * MINUTE, T0)).toBe(120 * 60 + 15 * 60);
    expect(svc.recorderTokenTtlSeconds(T0 - 200 * MINUTE, T0)).toBe(15 * 60);
  });

  test('recorder uids stay in 3…12, inside the reserved band and never 1 or 2', () => {
    expect(svc.recorderUidFor(0)).toBe(3);
    expect(svc.recorderUidFor(svc.RECORDING_MAX_ATTEMPTS - 1)).toBe(12);
  });

  test('availableUntil is the start plus 30 days', () => {
    expect(svc.availableUntilFor({ started_at: '2026-10-01 18:00:00' }))
      .toBe('2026-10-31T18:00:00.000Z');
  });
});

// =============================================================================
// Reconciler
// =============================================================================

describe('reconciler', () => {
  test('starts a composite recording when a recordable broadcast is active', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();

    await svc.reconcileEvent(eventId);

    const [task] = await tasksOf(eventId);
    expect(task).toMatchObject({
      mode: 'mix', attempt: 0, recorder_uid: 3, status: 'recording',
      resource_id: 'res-1', sid: 'sid-1', applied_layout: 'adaptive', s3_bucket: 'test-recordings',
    });
    expect(task.s3_prefix).toMatch(/^eventos\/[0-9a-f]{32}\/[0-9a-f]{32}\/$/);
    expect(fake.count('acquire')).toBe(1);
    expect(fake.count('start')).toBe(1);

    const acquire = fake.calls.find((c) => c.kind === 'acquire');
    const start = fake.calls.find((c) => c.kind === 'start');
    expect(acquire.body.clientRequest.startParameter).toEqual(start.body.clientRequest);
    expect(start.path).toMatch(/\/resourceid\/res-1\/mode\/mix\/start$/);
    expect(tokenSpy).toHaveBeenCalledWith(expect.objectContaining({
      channel: `event-${eventId}`, uid: 3, role: 'subscriber', ttlSeconds: 195 * 60,
    }));
  });

  test('a meeting starts in individual mode', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent({ interaction_mode: 'meeting' });

    await svc.reconcileEvent(eventId);

    const [task] = await tasksOf(eventId);
    expect(task.mode).toBe('individual');
    expect(task.applied_layout).toBeNull();
    expect(fake.calls.find((c) => c.kind === 'start').path).toMatch(/\/mode\/individual\/start$/);
  });

  test('a LiveKit or video event with the flag never records', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const livekit = await createEvent({ provider: 'livekit' });
    const video = await createEvent({ format: 'video' });

    await svc.reconcileEvent(livekit);
    await svc.reconcileEvent(video);

    expect(await tasksOf(livekit)).toHaveLength(0);
    expect(await tasksOf(video)).toHaveLength(0);
    expect(fake.calls).toHaveLength(0);
  });

  test('two reconciliations at once start ONE recording', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();

    await Promise.all([svc.reconcileEvent(eventId), svc.reconcileEvent(eventId), svc.reconcileEvent(eventId)]);

    expect(await tasksOf(eventId)).toHaveLength(1);
    expect(fake.count('acquire')).toBe(1);
  });

  test('two copies of the service racing lose on the database, not on Agora', async () => {
    const fakeA = createFakeAgora();
    const fakeB = createFakeAgora();
    configure(fakeA);
    let other;
    jest.isolateModules(() => { other = require('../services/agoraRecordingService'); });
    other.__configureForTests({ transport: fakeB.transport, storage: STORAGE, now: () => clock, downloadsAvailable: false });
    const eventId = await createEvent();

    await Promise.all([svc.reconcileEvent(eventId), other.reconcileEvent(eventId)]);

    expect(await tasksOf(eventId)).toHaveLength(1);
    expect(fakeA.count('acquire') + fakeB.count('acquire')).toBe(1);
    other.__resetForTests();
  });

  test('the database refuses a second live task for the same event', async () => {
    const eventId = await createEvent();
    const insert = (id, attempt) => db.execute({
      sql: `INSERT INTO event_recordings (id, event_id, mode, attempt, recorder_uid, status, s3_bucket, s3_prefix)
            VALUES (?, ?, 'mix', ?, ?, 'recording', 'b', 'p/')`,
      args: [id, eventId, attempt, 3 + attempt],
    });
    await insert(randomUUID(), 0);
    await expect(insert(randomUUID(), 1)).rejects.toThrow(/UNIQUE/);
  });

  test('ending the event stops the recording and keeps what Agora reports', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    await svc.reconcileEvent(eventId);

    await setEventStatus(eventId, 'finished');
    clock += 10 * MINUTE;
    await svc.reconcileEvent(eventId);

    const [task] = await tasksOf(eventId);
    expect(task).toMatchObject({ status: 'stopped', stop_reason: 'event_ended', upload_status: 'uploaded' });
    expect(JSON.parse(task.file_list)).toEqual([{ fileName: 'x.mp4' }]);
    const stop = fake.calls.find((c) => c.kind === 'stop');
    expect(stop.body).toEqual({ cname: `event-${eventId}`, uid: '3', clientRequest: { async_stop: false } });
    expect(fake.count('query')).toBe(0);
  });

  test('a stop answered 404 means the task already ended by itself', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    await svc.reconcileEvent(eventId);
    fake.handlers.stop = () => ({ status: 404, body: {} });

    await setEventStatus(eventId, 'cancelled');
    await svc.reconcileEvent(eventId);

    const [task] = await tasksOf(eventId);
    expect(task.status).toBe('stopped');
    expect(task.file_list).toBeNull();
  });

  test('the 180-minute ceiling stops the recording for good', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    await svc.reconcileEvent(eventId);

    clock += 181 * MINUTE;
    await svc.reconcileEvent(eventId);
    clock += MINUTE;
    await svc.reconcileEvent(eventId);

    const tasks = await tasksOf(eventId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ status: 'stopped', stop_reason: 'max_duration' });
    expect(fake.count('acquire')).toBe(1);
  });

  test('a recorder that died is marked interrupted and replaced by the next attempt', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    await svc.reconcileEvent(eventId);
    fake.handlers.query = () => ({ status: 404, body: {} });

    clock += 2 * MINUTE;
    await svc.reconcileEvent(eventId);

    const tasks = await tasksOf(eventId);
    expect(tasks.map((t) => [t.attempt, t.status, t.recorder_uid])).toEqual([
      [0, 'interrupted', 3],
      [1, 'recording', 4],
    ]);
    expect(tasks[0].s3_prefix).not.toBe(tasks[1].s3_prefix);
    expect(outboxSubjects()).toEqual([expect.stringContaining('se ha interrumpido')]);
  });

  test('an abnormal exit reported by query (status 20) counts as dead too', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    await svc.reconcileEvent(eventId);
    fake.handlers.query = () => ({ status: 200, body: { serverResponse: { status: 20 } } });

    clock += 2 * MINUTE;
    await svc.reconcileEvent(eventId);

    expect((await tasksOf(eventId))[0].status).toBe('interrupted');
  });

  test('query is not asked during the first 90 seconds of a task', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    await svc.reconcileEvent(eventId);

    clock += 60 * 1000;
    await svc.reconcileEvent(eventId);
    expect(fake.count('query')).toBe(0);

    clock += 60 * 1000;
    await svc.reconcileEvent(eventId);
    expect(fake.count('query')).toBe(1);
  });

  test('broken configuration: at most 10 attempts, 60 s apart, one email per kind', async () => {
    const fake = createFakeAgora();
    fake.handlers.acquire = () => ({ status: 401, body: { code: 7 } });
    configure(fake);
    const eventId = await createEvent();

    await svc.reconcileEvent(eventId);
    clock += 30 * 1000; // inside the cool-down
    await svc.reconcileEvent(eventId);
    expect(await tasksOf(eventId)).toHaveLength(1);

    for (let i = 0; i < 15; i += 1) {
      clock += 61 * 1000;
      await svc.reconcileEvent(eventId);
    }

    const tasks = await tasksOf(eventId);
    expect(tasks).toHaveLength(10);
    expect(tasks.every((t) => t.status === 'failed')).toBe(true);
    expect(tasks[0].error).toMatch(/401 \(código 7\)/);
    const subjects = outboxSubjects();
    expect(subjects.filter((s) => s.includes('no ha podido arrancar'))).toHaveLength(1);
    expect(subjects.filter((s) => s.includes('dejado de intentar'))).toHaveLength(1);
  });

  test('a start left hanging is marked failed and a new attempt follows', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    await db.execute({
      sql: `INSERT INTO event_recordings
              (id, event_id, mode, attempt, recorder_uid, status, s3_bucket, s3_prefix, created_at, updated_at)
            VALUES (?, ?, 'mix', 0, 3, 'starting', 'b', 'p/', ?, ?)`,
      args: [randomUUID(), eventId, '2026-10-01 17:55:00', '2026-10-01 17:55:00'],
    });

    await svc.reconcileEvent(eventId);

    const tasks = await tasksOf(eventId);
    expect(tasks.map((t) => t.status)).toEqual(['failed', 'recording']);
    expect(tasks[1].recorder_uid).toBe(4);
  });

  test('a start in flight (recent `starting`) is left alone', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    await db.execute({
      sql: `INSERT INTO event_recordings
              (id, event_id, mode, attempt, recorder_uid, status, s3_bucket, s3_prefix, created_at, updated_at)
            VALUES (?, ?, 'mix', 0, 3, 'starting', 'b', 'p/', ?, ?)`,
      args: [randomUUID(), eventId, '2026-10-01 17:59:30', '2026-10-01 17:59:30'],
    });

    await svc.reconcileEvent(eventId);

    expect(fake.calls).toHaveLength(0);
  });

  test('a stop left hanging is retried once stale', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent({ status: 'finished' });
    await db.execute({
      sql: `INSERT INTO event_recordings
              (id, event_id, mode, attempt, recorder_uid, status, stop_reason, resource_id, sid,
               s3_bucket, s3_prefix, created_at, started_at, updated_at)
            VALUES (?, ?, 'mix', 0, 3, 'stopping', 'event_ended', 'res-9', 'sid-9', 'b', 'p/', ?, ?, ?)`,
      args: [randomUUID(), eventId, '2026-10-01 17:00:00', '2026-10-01 17:00:00', '2026-10-01 17:57:00'],
    });

    await svc.reconcileEvent(eventId);

    const [task] = await tasksOf(eventId);
    expect(task.status).toBe('stopped');
    expect(fake.calls.find((c) => c.kind === 'stop').path).toMatch(/\/resourceid\/res-9\/sid\/sid-9\/mode\/mix\/stop$/);
  });

  test('with recording disabled nothing starts, but a live task is still stopped', async () => {
    const fake = createFakeAgora();
    configure(fake, { enabled: false });
    const idle = await createEvent();
    await svc.reconcileEvent(idle);
    expect(await tasksOf(idle)).toHaveLength(0);

    const running = await createEvent();
    await db.execute({
      sql: `INSERT INTO event_recordings
              (id, event_id, mode, attempt, recorder_uid, status, resource_id, sid, s3_bucket, s3_prefix,
               created_at, started_at, updated_at)
            VALUES (?, ?, 'mix', 0, 3, 'recording', 'res-7', 'sid-7', 'b', 'p/', ?, ?, ?)`,
      args: [randomUUID(), running, '2026-10-01 17:30:00', '2026-10-01 17:30:00', '2026-10-01 17:30:00'],
    });
    await svc.reconcileEvent(running);

    const [task] = await tasksOf(running);
    expect(task).toMatchObject({ status: 'stopped', stop_reason: 'recording_disabled' });
  });

  test('without the seam the suite never creates a task', async () => {
    const eventId = await createEvent();
    await svc.reconcileEvent(eventId);
    svc.triggerReconcile(eventId);
    expect(await tasksOf(eventId)).toHaveLength(0);
  });

  test('with the seam but no transport, the call fails in-process and the task is failed', async () => {
    configure(null);
    const eventId = await createEvent();

    await svc.reconcileEvent(eventId);

    const [task] = await tasksOf(eventId);
    expect(task.status).toBe('failed');
    expect(task.error).toMatch(/No se pudo contactar/);
  });
});

// =============================================================================
// Layout
// =============================================================================

describe('composite layout follows the screen share', () => {
  test('switches to the vertical layout with the screen big, and back', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    let sharing = false;
    const isHostScreenSharing = () => sharing;
    await svc.reconcileEvent(eventId, { isHostScreenSharing });

    sharing = true;
    clock += 2 * MINUTE;
    await svc.reconcileEvent(eventId, { isHostScreenSharing });
    let update = fake.calls.filter((c) => c.kind === 'updateLayout').pop();
    expect(update.body).toEqual({
      cname: `event-${eventId}`,
      uid: '3',
      clientRequest: { mixedVideoLayout: 2, maxResolutionUid: '2', backgroundColor: '#000000' },
    });
    expect((await tasksOf(eventId))[0].applied_layout).toBe('screen');

    sharing = false;
    await svc.reconcileEvent(eventId, { isHostScreenSharing });
    update = fake.calls.filter((c) => c.kind === 'updateLayout').pop();
    expect(update.body.clientRequest).toEqual({ mixedVideoLayout: 1, backgroundColor: '#000000' });
    expect((await tasksOf(eventId))[0].applied_layout).toBe('adaptive');
  });

  test('a failed updateLayout keeps recording and is retried next pass', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    await svc.reconcileEvent(eventId, { isHostScreenSharing: () => false });
    fake.handlers.updateLayout = () => ({ status: 500, body: {} });

    await svc.reconcileEvent(eventId, { isHostScreenSharing: () => true });
    expect((await tasksOf(eventId))[0]).toMatchObject({ status: 'recording', applied_layout: 'adaptive' });

    fake.handlers.updateLayout = () => ({ status: 200, body: {} });
    await svc.reconcileEvent(eventId, { isHostScreenSharing: () => true });
    expect((await tasksOf(eventId))[0].applied_layout).toBe('screen');
    expect(fake.count('updateLayout')).toBe(2);
  });

  test('without the presence reader the layout is left untouched', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();
    await svc.reconcileEvent(eventId, { isHostScreenSharing: () => true });
    expect((await tasksOf(eventId))[0].applied_layout).toBe('screen');

    await svc.reconcileEvent(eventId);
    expect(fake.count('updateLayout')).toBe(0);
  });

  test('a task started while the host shares already asks for the screen layout', async () => {
    const fake = createFakeAgora();
    configure(fake);
    const eventId = await createEvent();

    await svc.reconcileEvent(eventId, { isHostScreenSharing: () => true });

    const start = fake.calls.find((c) => c.kind === 'start');
    expect(start.body.clientRequest.recordingConfig.transcodingConfig).toMatchObject({
      mixedVideoLayout: 2, maxResolutionUid: '2',
    });
  });
});

// =============================================================================
// Socket: the screen_share signal
// =============================================================================

describe('screen_share in the authenticated event room', () => {
  function createFakeServer() {
    let onConnection = null;
    const io = {
      on: (name, handler) => { if (name === 'connection') onConnection = handler; },
      to: () => ({ emit: () => {} }),
    };
    const helpers = setupEventSocket(io);
    const connect = () => {
      const handlers = {};
      const socket = {
        id: `socket-${Math.random()}`,
        data: {},
        handshake: { headers: {}, address: '127.0.0.1' },
        on: (name, handler) => { handlers[name] = handler; },
        emit: () => {},
        join: () => {},
        leave: () => {},
        to: () => ({ emit: () => {} }),
      };
      onConnection(socket);
      socket.joinRoom = (payload) => new Promise((resolve) => handlers.join_event_room(payload, resolve));
      socket.send = (name, payload) => handlers[name](payload);
      return socket;
    };
    return { helpers, connect };
  }

  test('the host flagging a share triggers a reconciliation that can read it', async () => {
    const eventId = await createEvent();
    const trigger = jest.spyOn(svc, 'triggerReconcile').mockImplementation(() => {});
    const { helpers, connect } = createFakeServer();
    const host = connect();
    const hostToken = jwt.sign({ id: hostId, email: 'h@example.com', role: 'seller' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const ack = await host.joinRoom({ eventId, hostToken });
    expect(ack.ok).toBe(true);

    expect(helpers.isHostScreenSharing(eventId)).toBe(false);
    host.send('screen_share', { active: true });

    expect(helpers.isHostScreenSharing(eventId)).toBe(true);
    expect(trigger).toHaveBeenCalledWith(eventId, { isHostScreenSharing: expect.any(Function) });
    const reader = trigger.mock.calls[0][1].isHostScreenSharing;
    expect(reader(eventId)).toBe(true);
    expect(helpers.isHostScreenSharing('no-such-event')).toBe(false);
  });
});

// =============================================================================
// Secrets and alerts
// =============================================================================

describe('secrets never leave through logs, the database or the alert email', () => {
  test('a rejected start that echoes the key and the token leaks neither', async () => {
    const captured = [];
    for (const level of ['error', 'warn', 'info', 'debug']) {
      jest.spyOn(logger, level).mockImplementation((...args) => { captured.push(args); });
    }
    const fake = createFakeAgora();
    fake.handlers.start = ({ body }) => ({
      status: 400,
      body: { code: 2, reason: `invalid storage ${SECRET_KEY} ${ACCESS_KEY} token=${body.clientRequest.token}` },
    });
    configure(fake);
    const eventId = await createEvent();

    await svc.reconcileEvent(eventId);

    const token = 'recorder-token-3-11700';
    const [task] = await tasksOf(eventId);
    const surfaces = [
      JSON.stringify(captured),
      task.error,
      JSON.stringify(emailService.__getOutbox()),
    ];
    for (const text of surfaces) {
      expect(text).not.toContain(SECRET_KEY);
      expect(text).not.toContain(ACCESS_KEY);
      expect(text).not.toContain(token);
    }
    expect(task.error).toMatch(/400 \(código 2\)/);
    expect(task.error).toContain('[redacted]');
  });
});

describe('retention rule check', () => {
  const run = (rules, extra = {}) => {
    const reader = jest.fn(async () => {
      if (rules instanceof Error) throw rules;
      return rules;
    });
    configure(createFakeAgora(), { downloadsAvailable: true, ...extra });
    return svc.checkRetentionRule({ getLifecycleRules: reader }).then((result) => ({ result, reader }));
  };
  const alerts = () => outboxSubjects().filter((s) => s.includes('no caducan'));

  test.each([
    ['a 30-day rule on eventos/', [{ Status: 'Enabled', Filter: { Prefix: 'eventos/' }, Expiration: { Days: 30 } }]],
    ['a 30-day rule on the whole bucket', [{ Status: 'Enabled', Filter: {}, Expiration: { Days: 30 } }]],
    ['a shorter rule among others', [
      { Status: 'Enabled', AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 }, Filter: { Prefix: '' } },
      { Status: 'Enabled', Filter: { Prefix: 'eventos/' }, Expiration: { Days: 7 } },
    ]],
  ])('%s passes silently', async (_label, rules) => {
    const { result } = await run(rules);
    expect(result).toEqual({ checked: true, ok: true });
    expect(alerts()).toHaveLength(0);
  });

  test.each([
    ['no rules at all', []],
    ['a rule longer than 30 days', [{ Status: 'Enabled', Filter: { Prefix: 'eventos/' }, Expiration: { Days: 90 } }]],
    ['a disabled rule', [{ Status: 'Disabled', Filter: { Prefix: 'eventos/' }, Expiration: { Days: 30 } }]],
    ['a rule on another prefix', [{ Status: 'Enabled', Filter: { Prefix: 'otros/' }, Expiration: { Days: 30 } }]],
    ['a rule narrowed by a tag', [{ Status: 'Enabled', Filter: { Tag: { Key: 'k', Value: 'v' } }, Expiration: { Days: 30 } }]],
    ['an unreadable configuration', new Error('AccessDenied')],
  ])('%s raises retention_rule_missing', async (_label, rules) => {
    const { result } = await run(rules);
    expect(result).toEqual({ checked: true, ok: false });
    expect(alerts()).toHaveLength(1);
  });

  test('without read credentials nothing is read and nothing is raised', async () => {
    const { result, reader } = await run([], { downloadsAvailable: false });
    expect(result).toEqual({ checked: false, ok: null });
    expect(reader).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(0);
  });
});
