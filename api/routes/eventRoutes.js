const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { authenticate } = require('../middleware/authorization');

// All routes are public (no authentication required) unless specified

/**
 * GET /api/events
 * Get events by date range (for calendar view)
 */
router.get('/', eventController.getEvents);

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

module.exports = router;
