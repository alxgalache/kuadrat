const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const eventAdminController = require('../../controllers/eventAdminController')

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
router.post('/', eventAdminController.createEvent);

/**
 * GET /api/admin/espacios
 * List all events
 */
router.get('/', eventAdminController.listEvents);

/**
 * GET /api/admin/espacios/:id
 * Get event details
 */
router.get('/:id', eventAdminController.getEvent);

/**
 * PUT /api/admin/espacios/:id
 * Update event
 */
router.put('/:id', eventAdminController.updateEvent);

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
 * POST /api/admin/espacios/:id/upload-video
 * Upload a video file for a video-format event
 */
router.post('/:id/upload-video', eventVideoUpload.single('video'), eventAdminController.uploadVideo);

module.exports = router
