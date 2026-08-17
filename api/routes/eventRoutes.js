const express = require('express');
const multer = require('multer');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { authenticate } = require('../middleware/authorization');
const { validate } = require('../middleware/validate');
const { cacheControl } = require('../middleware/cache');
const { sensitiveLimiter } = require('../middleware/rateLimiter');
const { sendVerificationSchema, verifyEmailSchema, verifyPasswordSchema, renewTokenSchema, whiteboardTokenSchema, whiteboardImageSchema } = require('../validators/eventSchemas');

// Multer configuration for whiteboard image uploads (PNG, JPG, WEBP) up to
// 10MB (memory storage) — same limits as product images
const whiteboardImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PNG, JPG, and WEBP images are allowed'));
  },
});

// All routes are public (no authentication required) unless specified

/**
 * GET /api/events/whiteboard-images/:basename
 * Serve locally stored whiteboard images (with S3, URLs point at the CDN)
 */
router.get('/whiteboard-images/:basename', cacheControl({ maxAge: 86400 }), eventController.getWhiteboardImage);

/**
 * GET /api/events
 * Get events by date range (for calendar view)
 */
router.get('/', eventController.getEvents);

/**
 * POST /api/events/:id/video-token
 * Get a short-lived signed token to access the event video
 */
router.post('/:id/video-token', eventController.getVideoToken);

/**
 * GET /api/events/:id/video/:filename?vtoken=...
 * Serve uploaded event video files (protected by signed token)
 */
router.get('/:id/video/:filename', eventController.getEventVideo);

/**
 * GET /api/events/:slug
 * Get event details by slug
 */
router.get('/:slug', eventController.getEventBySlug);

/**
 * POST /api/events/:id/register
 * Register an attendee (name + email)
 */
router.post('/:id/register', eventController.registerAttendee);

/**
 * POST /api/events/:id/pay
 * Create a Stripe PaymentIntent for a paid event
 */
router.post('/:id/pay', eventController.createPayment);

/**
 * POST /api/events/:id/confirm-payment
 * Confirm payment after Stripe
 */
router.post('/:id/confirm-payment', eventController.confirmPayment);

/**
 * POST /api/events/:id/admin-access
 * Admin-only: join any event as an ordinary participant, skipping
 * registration, email verification and payment. Returns the same
 * { attendeeId, accessToken } pair the registration modal produces.
 */
router.post('/:id/admin-access', authenticate, eventController.getAdminAccess);

/**
 * POST /api/events/:id/token
 * Get LiveKit viewer token for an attendee
 */
router.post('/:id/token', eventController.getViewerToken);

/**
 * POST /api/events/:id/host-token
 * Get LiveKit host token (requires auth, seller only)
 */
router.post('/:id/host-token', authenticate, eventController.getHostToken);

/**
 * POST /api/events/:id/renew-token
 * Agora events: re-issue an RTC token for the caller's current role
 * Authentication: attendee credentials in body, or JWT for host/admin
 */
router.post('/:id/renew-token', validate(renewTokenSchema), eventController.renewToken);

/**
 * POST /api/events/:id/whiteboard-token
 * Agora events (optional whiteboard phase): per-role whiteboard room token
 * Authentication: attendee credentials in body, or JWT for host/admin
 */
router.post('/:id/whiteboard-token', validate(whiteboardTokenSchema), eventController.getWhiteboardToken);

/**
 * POST /api/events/:id/whiteboard-image
 * Agora events (optional whiteboard phase): upload an image to insert into
 * the active whiteboard (host or writer attendees). Multer must run before
 * validate() so the multipart body fields are parsed.
 */
router.post('/:id/whiteboard-image', whiteboardImageUpload.single('image'), validate(whiteboardImageSchema), eventController.uploadWhiteboardImage);

/**
 * POST /api/events/:id/end
 * End an event (requires auth, host only)
 */
router.post('/:id/end', authenticate, eventController.endEvent);

/**
 * POST /api/events/:id/participants/:identity/promote
 * Grant canPublish permission (host-only)
 */
router.post('/:id/participants/:identity/promote', authenticate, eventController.promoteParticipant);

/**
 * POST /api/events/:id/participants/:identity/demote
 * Revoke canPublish permission (host-only)
 */
router.post('/:id/participants/:identity/demote', authenticate, eventController.demoteParticipant);

/**
 * POST /api/events/:id/participants/:identity/report-spam
 * Report a spammer — chat-bans (canPublishData=false), stays in room
 * Authentication: valid attendee credentials in body, or JWT for host
 */
router.post('/:id/participants/:identity/report-spam', eventController.reportSpam);

/**
 * POST /api/events/:id/participants/:identity/ban-from-chat
 * Host manually bans a participant from chat (requires auth)
 */
router.post('/:id/participants/:identity/ban-from-chat', authenticate, eventController.banFromChat);

/**
 * POST /api/events/:id/send-verification
 * Send OTP verification code to attendee's email
 */
router.post('/:id/send-verification', sensitiveLimiter, validate(sendVerificationSchema), eventController.sendVerification);

/**
 * POST /api/events/:id/verify-email
 * Verify OTP code for email verification
 */
router.post('/:id/verify-email', sensitiveLimiter, validate(verifyEmailSchema), eventController.verifyEmail);

/**
 * POST /api/events/:id/verify-password
 * Verify email + password for returning attendees
 */
router.post('/:id/verify-password', sensitiveLimiter, validate(verifyPasswordSchema), eventController.verifyPassword);

module.exports = router;
