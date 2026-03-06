const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { authenticate } = require('../middleware/authorization');
const { validate } = require('../middleware/validate');
const { sensitiveLimiter } = require('../middleware/rateLimiter');
const { sendVerificationSchema, verifyEmailSchema, verifyPasswordSchema } = require('../validators/eventSchemas');

// All routes are public (no authentication required) unless specified

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
