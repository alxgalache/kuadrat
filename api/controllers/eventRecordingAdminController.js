/**
 * Admin access to the cloud recordings of an event (change:
 * agora-event-recording). Nothing here moves a byte of video: the listing reads
 * the bucket, and downloads are presigned URLs the browser follows straight to
 * S3 — the api container has 0.75 vCPU and must never stream recordings.
 */
const { db } = require('../config/database');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');
const { parseSqlUtcDate } = require('../utils/passwordSecurity');
const { mp4Files, groupObjectsByUid, totals } = require('../utils/recordingFiles');
const eventService = require('../services/eventService');
const agoraRecordingService = require('../services/agoraRecordingService');
const agoraService = require('../services/agoraService');
const s3Service = require('../services/s3Service');

const DOWNLOAD_URL_TTL_SECONDS = 900;

function isoOrNull(sqlValue) {
  const date = parseSqlUtcDate(sqlValue);
  return date ? date.toISOString() : null;
}

function parseFileList(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * uid → display name for an individual recording: uid 1 is the event's host,
 * anything else is looked up in event_attendees.agora_uid for that event.
 */
async function participantNames(event, uids) {
  const names = new Map();
  if (uids.includes(agoraService.HOST_UID)) {
    const host = await db.execute({
      sql: 'SELECT full_name FROM users WHERE id = ?',
      args: [event.host_user_id],
    });
    names.set(agoraService.HOST_UID, { name: host.rows[0]?.full_name || 'Host', role: 'host' });
  }
  const attendeeUids = uids.filter((uid) => uid !== agoraService.HOST_UID);
  if (attendeeUids.length > 0) {
    const placeholders = attendeeUids.map(() => '?').join(', ');
    const rows = await db.execute({
      sql: `SELECT agora_uid, first_name, last_name FROM event_attendees
            WHERE event_id = ? AND agora_uid IN (${placeholders})`,
      args: [event.id, ...attendeeUids],
    });
    for (const row of rows.rows) {
      const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      names.set(Number(row.agora_uid), { name: name || `Participante (uid ${row.agora_uid})`, role: 'participant' });
    }
  }
  return names;
}

// GET /api/admin/events/recording/availability
const getRecordingAvailability = async (req, res, next) => {
  try {
    return sendSuccess(res, {
      recordingAvailable: agoraRecordingService.recordingEnabled(),
      downloadsAvailable: agoraRecordingService.downloadsAvailable(),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/events/:id/recordings
const listEventRecordings = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(req.params.id);
    if (!event) throw new ApiError(404, 'Evento no encontrado', 'No encontrado');

    const tasksResult = await db.execute({
      sql: 'SELECT * FROM event_recordings WHERE event_id = ? ORDER BY attempt ASC',
      args: [event.id],
    });
    const downloadsAvailable = agoraRecordingService.downloadsAvailable();
    const region = agoraRecordingService.storageSettings().region;

    const recordings = [];
    for (const task of tasksResult.rows) {
      const item = {
        id: task.id,
        mode: task.mode,
        attempt: Number(task.attempt),
        status: task.status,
        stopReason: task.stop_reason || null,
        uploadStatus: task.upload_status || null,
        error: task.error || null,
        createdAt: isoOrNull(task.created_at),
        startedAt: isoOrNull(task.started_at),
        stoppedAt: isoOrNull(task.stopped_at),
        availableUntil: agoraRecordingService.availableUntilFor(task),
        bucket: task.s3_bucket,
        prefix: task.s3_prefix,
        listed: false,
        listError: null,
        objectCount: null,
        totalBytes: null,
        files: [],
        participants: [],
        fileList: null,
      };

      if (!downloadsAvailable) {
        item.fileList = parseFileList(task.file_list);
        recordings.push(item);
        continue;
      }

      try {
        const objects = await s3Service.listObjectsIn({ bucket: task.s3_bucket, region, prefix: task.s3_prefix });
        Object.assign(item, totals(objects), { listed: true });
        if (task.mode === 'mix') {
          item.files = mp4Files(objects);
        } else {
          const groups = groupObjectsByUid(objects);
          const names = await participantNames(event, groups.map((g) => g.uid));
          item.participants = groups.map((group) => {
            const known = names.get(group.uid);
            return {
              ...group,
              name: known ? known.name : `Participante (uid ${group.uid})`,
              role: known ? known.role : 'unknown',
            };
          });
        }
      } catch (err) {
        // One unreadable folder must not take the whole panel down.
        logger.error(
          { eventId: event.id, recordingId: task.id, errName: err?.name },
          '[eventRecordingAdmin] Could not list recording objects'
        );
        item.listError = 'No se pudo leer el contenido de esta grabación en el almacenamiento';
        item.fileList = parseFileList(task.file_list);
      }
      recordings.push(item);
    }

    return sendSuccess(res, {
      recordingAvailable: agoraRecordingService.recordingEnabled(),
      downloadsAvailable,
      retentionDays: agoraRecordingService.RECORDING_RETENTION_DAYS,
      recordings,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/events/:id/recordings/:recordingId/download?file=<name>.mp4
const getRecordingDownloadUrl = async (req, res, next) => {
  try {
    if (!agoraRecordingService.downloadsAvailable()) {
      throw new ApiError(503, 'La descarga de grabaciones no está disponible en este entorno', 'Descarga no disponible');
    }
    const { id, recordingId } = req.params;
    const file = String(req.query.file || '');
    if (!/^[A-Za-z0-9_.-]+\.mp4$/.test(file)) {
      throw new ApiError(400, 'Nombre de fichero inválido', 'Datos inválidos');
    }

    const result = await db.execute({
      sql: 'SELECT id, event_id, mode, s3_bucket, s3_prefix FROM event_recordings WHERE id = ? AND event_id = ?',
      args: [recordingId, id],
    });
    const task = result.rows[0];
    if (!task) throw new ApiError(404, 'Grabación no encontrada', 'No encontrada');
    if (task.mode !== 'mix') {
      throw new ApiError(400, 'Las pistas de una reunión se descargan con el comando de la ficha', 'Datos inválidos');
    }

    // The key is built HERE from the row: the client names a file, never a key.
    const url = await s3Service.getPresignedDownloadUrl({
      bucket: task.s3_bucket,
      region: agoraRecordingService.storageSettings().region,
      key: `${task.s3_prefix}${file}`,
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
      downloadName: file,
    });
    logger.info({ eventId: id, recordingId, file, adminId: req.user?.id }, '[eventRecordingAdmin] Download URL issued');
    return sendSuccess(res, { url });
  } catch (error) {
    next(error);
  }
};

module.exports = { getRecordingAvailability, listEventRecordings, getRecordingDownloadUrl };
