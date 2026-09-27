/**
 * Admin access to event recordings (openspec change: agora-event-recording).
 *
 * Driven through the real routes with supertest, so admin auth and the Zod
 * schemas run as in production. S3 is never reached: the listing and the
 * presigner are spied on, and the recording service's seam decides whether
 * this "environment" has read credentials.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const s3Service = require('../services/s3Service');
const svc = require('../services/agoraRecordingService');

const STORAGE = Object.freeze({
  bucket: 'test-recordings', region: 'eu-west-1', regionCode: 4, accessKey: 'AKIAX', secretKey: 'secret-x',
});

let adminToken;
let sellerToken;
let hostId;

const tokenFor = (id, email, role) =>
  jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function insertUser(role, fullName) {
  const email = `rec-admin-${role}-${Date.now()}-${Math.random()}@example.com`;
  const result = await db.execute({
    sql: 'INSERT INTO users (email, password_hash, role, full_name, visible) VALUES (?, ?, ?, ?, 1)',
    args: [email, 'x', role, fullName],
  });
  return { id: Number(result.lastInsertRowid), email };
}

async function createEvent(interactionMode) {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, category,
             status, provider, format, interaction_mode, recording_enabled, agora_channel_name)
          VALUES (?, 'Evento grabado', ?, '2026-10-01 18:00:00', ?, 'free', 'charla',
                  'finished', 'agora', 'live', ?, 1, ?)`,
    args: [id, `rec-admin-${id}`, hostId, interactionMode, `event-${id}`],
  });
  return id;
}

async function insertTask(eventId, { mode, attempt = 0, startedAt = '2026-10-01 18:00:00', fileList = null } = {}) {
  const id = randomUUID();
  const prefix = `eventos/${eventId.replace(/-/g, '')}/${id.replace(/-/g, '')}/`;
  await db.execute({
    sql: `INSERT INTO event_recordings
            (id, event_id, mode, attempt, recorder_uid, status, stop_reason, resource_id, sid,
             s3_bucket, s3_prefix, file_list, created_at, started_at, stopped_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'stopped', 'event_ended', 'res', 'sid', 'test-recordings', ?, ?, ?, ?, ?, ?)`,
    args: [id, eventId, mode, attempt, 3 + attempt, prefix, fileList, startedAt, startedAt,
      '2026-10-01 19:30:00', '2026-10-01 19:30:00'],
  });
  return { id, prefix };
}

async function insertAttendee(eventId, agoraUid, firstName, lastName) {
  await db.execute({
    sql: `INSERT INTO event_attendees (id, event_id, first_name, last_name, email, status, agora_uid)
          VALUES (?, ?, ?, ?, ?, 'joined', ?)`,
    args: [randomUUID(), eventId, firstName, lastName, `${firstName}-${Date.now()}@example.com`, agoraUid],
  });
}

beforeAll(async () => {
  const admin = await insertUser('admin', 'Ada Admin');
  const seller = await insertUser('seller', 'Sergio Vendedor');
  const host = await insertUser('seller', 'Helena Host');
  adminToken = tokenFor(admin.id, admin.email, 'admin');
  sellerToken = tokenFor(seller.id, seller.email, 'seller');
  hostId = host.id;
});

afterEach(() => {
  svc.__resetForTests();
  jest.restoreAllMocks();
});

const withReadCredentials = (downloadsAvailable) =>
  svc.__configureForTests({ storage: STORAGE, downloadsAvailable });

describe('GET /api/admin/events/recording/availability', () => {
  test('reports recording and downloads separately', async () => {
    withReadCredentials(true);
    const res = await request(app)
      .get('/api/admin/events/recording/availability')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, recordingAvailable: true, downloadsAvailable: true });
  });

  test('is not read as an event id, and is admin only', async () => {
    const res = await request(app)
      .get('/api/admin/events/recording/availability')
      .set('Authorization', `Bearer ${sellerToken}`);
    // adminAuth answers 401 to an authenticated non-admin (existing behaviour).
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/events/:id/recordings', () => {
  test('a stream lists its MP4 files in order, per part, with the 30-day limit', async () => {
    withReadCredentials(true);
    const eventId = await createEvent('broadcast');
    const first = await insertTask(eventId, { mode: 'mix', attempt: 0 });
    const second = await insertTask(eventId, { mode: 'mix', attempt: 1, startedAt: '2026-10-01 18:40:00' });
    jest.spyOn(s3Service, 'listObjectsIn').mockImplementation(async ({ prefix }) => {
      if (prefix === first.prefix) {
        return [
          { key: `${prefix}sid_event_1.mp4`, size: 200 },
          { key: `${prefix}sid_event.m3u8`, size: 5 },
          { key: `${prefix}sid_event_0.mp4`, size: 100 },
          { key: `${prefix}sid_event_20261001180000000.ts`, size: 50 },
        ];
      }
      return [];
    });

    const res = await request(app)
      .get(`/api/admin/events/${eventId}/recordings`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.retentionDays).toBe(30);
    const [a, b] = res.body.recordings;
    expect(a.files).toEqual([
      { name: 'sid_event_0.mp4', bytes: 100 },
      { name: 'sid_event_1.mp4', bytes: 200 },
    ]);
    expect(a).toMatchObject({ listed: true, objectCount: 4, totalBytes: 355, startedAt: '2026-10-01T18:00:00.000Z' });
    expect(a.availableUntil).toBe('2026-10-31T18:00:00.000Z');
    expect(b.id).toBe(second.id);
    expect(b.files).toEqual([]);
  });

  test('a meeting groups the tracks by uid and names each participant', async () => {
    withReadCredentials(true);
    const eventId = await createEvent('meeting');
    await insertAttendee(eventId, 101, 'Marta', 'Ruiz');
    const task = await insertTask(eventId, { mode: 'individual' });
    const p = task.prefix;
    jest.spyOn(s3Service, 'listObjectsIn').mockResolvedValue([
      { key: `${p}sid_c__uid_s_1__uid_e_audio.m3u8`, size: 1 },
      { key: `${p}sid_c__uid_s_1__uid_e_audio_20261001180000000.ts`, size: 10 },
      { key: `${p}sid_c__uid_s_1__uid_e_video_20261001180000000.webm`, size: 100 },
      { key: `${p}sid_c__uid_s_101__uid_e_video_20261001180000000.webm`, size: 50 },
      { key: `${p}sid_c__uid_s_777__uid_e_audio_20261001180000000.ts`, size: 5 },
    ]);

    const res = await request(app)
      .get(`/api/admin/events/${eventId}/recordings`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.recordings[0].participants).toEqual([
      { uid: 1, name: 'Helena Host', role: 'host', tracks: ['audio', 'video'], objectCount: 3, bytes: 111 },
      { uid: 101, name: 'Marta Ruiz', role: 'participant', tracks: ['video'], objectCount: 1, bytes: 50 },
      { uid: 777, name: 'Participante (uid 777)', role: 'unknown', tracks: ['audio'], objectCount: 1, bytes: 5 },
    ]);
  });

  test('without read credentials it never calls S3 and returns what the database has', async () => {
    withReadCredentials(false);
    const eventId = await createEvent('broadcast');
    await insertTask(eventId, { mode: 'mix', fileList: JSON.stringify([{ fileName: 'a.mp4' }]) });
    const list = jest.spyOn(s3Service, 'listObjectsIn');

    const res = await request(app)
      .get(`/api/admin/events/${eventId}/recordings`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(list).not.toHaveBeenCalled();
    expect(res.body.downloadsAvailable).toBe(false);
    expect(res.body.recordings[0]).toMatchObject({
      listed: false, bucket: 'test-recordings', fileList: [{ fileName: 'a.mp4' }],
    });
  });

  test('an unreadable folder degrades that part only', async () => {
    withReadCredentials(true);
    const eventId = await createEvent('broadcast');
    await insertTask(eventId, { mode: 'mix' });
    jest.spyOn(s3Service, 'listObjectsIn').mockRejectedValue(Object.assign(new Error('denied'), { name: 'AccessDenied' }));

    const res = await request(app)
      .get(`/api/admin/events/${eventId}/recordings`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.recordings[0].listError).toEqual(expect.any(String));
  });

  test('404 for an unknown event', async () => {
    withReadCredentials(true);
    const res = await request(app)
      .get(`/api/admin/events/${randomUUID()}/recordings`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/events/:id/recordings/:recordingId/download', () => {
  test('signs the task prefix + file, never a key from the client', async () => {
    withReadCredentials(true);
    const eventId = await createEvent('broadcast');
    const task = await insertTask(eventId, { mode: 'mix' });
    const presign = jest.spyOn(s3Service, 'getPresignedDownloadUrl').mockResolvedValue('https://signed.example/x');

    const res = await request(app)
      .get(`/api/admin/events/${eventId}/recordings/${task.id}/download`)
      .query({ file: 'sid_event_0.mp4' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://signed.example/x');
    expect(presign).toHaveBeenCalledWith({
      bucket: 'test-recordings',
      region: 'eu-west-1',
      key: `${task.prefix}sid_event_0.mp4`,
      expiresIn: 900,
      downloadName: 'sid_event_0.mp4',
    });
  });

  test.each([
    ['../otra/clave.mp4'],
    ['eventos/a/b/x.mp4'],
    ['notes.txt'],
  ])('refuses file=%s with 400 before signing anything', async (file) => {
    withReadCredentials(true);
    const eventId = await createEvent('broadcast');
    const task = await insertTask(eventId, { mode: 'mix' });
    const presign = jest.spyOn(s3Service, 'getPresignedDownloadUrl');

    const res = await request(app)
      .get(`/api/admin/events/${eventId}/recordings/${task.id}/download`)
      .query({ file })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(presign).not.toHaveBeenCalled();
  });

  test('404 for a recording of another event', async () => {
    withReadCredentials(true);
    const eventId = await createEvent('broadcast');
    const otherEvent = await createEvent('broadcast');
    const task = await insertTask(otherEvent, { mode: 'mix' });

    const res = await request(app)
      .get(`/api/admin/events/${eventId}/recordings/${task.id}/download`)
      .query({ file: 'a.mp4' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  test('400 for a meeting: its tracks are downloaded with the command', async () => {
    withReadCredentials(true);
    const eventId = await createEvent('meeting');
    const task = await insertTask(eventId, { mode: 'individual' });

    const res = await request(app)
      .get(`/api/admin/events/${eventId}/recordings/${task.id}/download`)
      .query({ file: 'a.mp4' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  test('503 where the app has no read credentials', async () => {
    withReadCredentials(false);
    const eventId = await createEvent('broadcast');
    const task = await insertTask(eventId, { mode: 'mix' });
    const presign = jest.spyOn(s3Service, 'getPresignedDownloadUrl');

    const res = await request(app)
      .get(`/api/admin/events/${eventId}/recordings/${task.id}/download`)
      .query({ file: 'a.mp4' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(503);
    expect(presign).not.toHaveBeenCalled();
  });

  test('401 for a non-admin (adminAuth)', async () => {
    const res = await request(app)
      .get(`/api/admin/events/${randomUUID()}/recordings/${randomUUID()}/download`)
      .query({ file: 'a.mp4' })
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(res.status).toBe(401);
  });
});

describe('attendees and hosts never learn that an event is recorded', () => {
  test('the public event endpoints do not carry recording_enabled; the admin one does', async () => {
    const eventId = await createEvent('broadcast');

    const bySlug = await request(app).get(`/api/events/rec-admin-${eventId}`);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.event.id).toBe(eventId);
    expect(bySlug.body.event).not.toHaveProperty('recording_enabled');

    const list = await request(app).get('/api/events').query({ from: '2026-10-01', to: '2026-10-02' });
    expect(list.status).toBe(200);
    const listed = list.body.events.find((e) => e.id === eventId);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty('recording_enabled');

    const admin = await request(app)
      .get(`/api/admin/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(admin.status).toBe(200);
    expect(admin.body.event.recording_enabled).toBe(1);
  });
});
