const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const eventAdminController = require('../../controllers/eventAdminController')
const eventRecordingAdminController = require('../../controllers/eventRecordingAdminController')
const { validate } = require('../../middleware/validate')
const {
  createEventSchema,
  updateEventSchema,
  markEventFinishedSchema,
  excludeEventCreditSchema,
  eventRecordingsSchema,
  recordingDownloadSchema,
} = require('../../validators/eventSchemas')

// Configure multer for event video uploads
const eventVideoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/events')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    cb(null, 'event-' + uniqueSuffix + ext)
  }
})

const eventVideoUpload = multer({
  storage: eventVideoStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only MP4, WebM and MOV are allowed'))
    }
  }
})

/**
 * POST /api/admin/espacios
 * Create a new event
 */
router.post('/', validate(createEventSchema), eventAdminController.createEvent);

/**
 * GET /api/admin/espacios
 * List all events
 */
router.get('/', eventAdminController.listEvents);

/**
 * GET /api/admin/events/recording/availability
 * Whether this environment can record (Agora Cloud Recording configured) and
 * can hand out downloads (the app's own AWS credentials). Declared ABOVE the
 * /:id routes so Express never reads «recording» as an event id.
 */
router.get('/recording/availability', eventRecordingAdminController.getRecordingAvailability);

/**
 * GET /api/admin/espacios/:id
 * Get event details
 */
router.get('/:id', eventAdminController.getEvent);

/**
 * GET /api/admin/events/:id/recordings
 * Cloud recordings of the event, read from the bucket (agora-event-recording)
 */
router.get('/:id/recordings', validate(eventRecordingsSchema), eventRecordingAdminController.listEventRecordings);

/**
 * GET /api/admin/events/:id/recordings/:recordingId/download?file=<name>.mp4
 * Short-lived presigned URL, signed on click (agora-event-recording)
 */
router.get(
  '/:id/recordings/:recordingId/download',
  validate(recordingDownloadSchema),
  eventRecordingAdminController.getRecordingDownloadUrl
);

/**
 * PUT /api/admin/espacios/:id
 * Update event
 */
router.put('/:id', validate(updateEventSchema), eventAdminController.updateEvent);

/**
 * DELETE /api/admin/espacios/:id
 * Delete event
 */
router.delete('/:id', eventAdminController.deleteEvent);

/**
 * POST /api/admin/espacios/:id/start
 * Start event (creates LiveKit room)
 */
router.post('/:id/start', eventAdminController.startEvent);

/**
 * POST /api/admin/espacios/:id/end
 * End event (cleans up LiveKit room)
 */
router.post('/:id/end', eventAdminController.endEvent);

/**
 * GET /api/admin/espacios/:id/attendees
 * List attendees
 */
router.get('/:id/attendees', eventAdminController.getAttendees);

/**
 * GET /api/admin/espacios/:id/participants
 * List LiveKit room participants
 */
router.get('/:id/participants', eventAdminController.listParticipants);

/**
 * POST /api/admin/espacios/:id/participants/:identity/promote
 * Promote viewer to speaker
 */
router.post('/:id/participants/:identity/promote', eventAdminController.promoteParticipant);

/**
 * POST /api/admin/espacios/:id/participants/:identity/demote
 * Demote speaker to viewer
 */
router.post('/:id/participants/:identity/demote', eventAdminController.demoteParticipant);

/**
 * POST /api/admin/espacios/:id/participants/:identity/mute
 * Mute/unmute a participant's track
 */
router.post('/:id/participants/:identity/mute', eventAdminController.muteParticipant);

/**
 * POST /api/admin/events/:id/upload-video
 * Upload a video file for a video-format event
 */
router.post('/:id/upload-video', eventVideoUpload.single('video'), eventAdminController.uploadVideo);

// ---------------------------------------------------------------------------
// Change #3: stripe-connect-events-wallet — credit lifecycle admin endpoints
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/events/:id/mark-finished
 * Manual fallback to set finished_at when the host disconnect hook never fired.
 * Body (optional): { finished_at: ISO8601 }
 */
router.post('/:id/mark-finished', validate(markEventFinishedSchema), eventAdminController.markFinished);

/**
 * POST /api/admin/events/:id/exclude-credit
 * Flag a paid event so the credit scheduler skips it permanently.
 * Body: { reason: string }
 */
router.post('/:id/exclude-credit', validate(excludeEventCreditSchema), eventAdminController.excludeCredit);

/**
 * POST /api/admin/events/:id/include-credit
 * Revert a previous exclusion.
 */
router.post('/:id/include-credit', eventAdminController.includeCredit);

module.exports = router
