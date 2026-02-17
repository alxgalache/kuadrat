const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { ApiError } = require('../middleware/errorHandler');
const eventService = require('../services/eventService');
const livekitService = require('../services/livekitService');
const stripeService = require('../services/stripeService');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}

const EVENTS_VIDEOS_DIR = path.join(__dirname, '..', 'uploads', 'events');

// ---------------------------------------------------------------------------
// GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD
// ---------------------------------------------------------------------------
const getEvents = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      throw new ApiError(400, 'Los parámetros "from" y "to" son obligatorios', 'Solicitud inválida');
    }
    const events = await eventService.getEventsByDateRange(from, to);
    res.status(200).json({ success: true, events });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/events/:slug
// ---------------------------------------------------------------------------
const getEventBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const event = await eventService.getEventBySlug(slug);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }

    const attendeeCount = await eventService.getAttendeeCount(event.id);
    res.status(200).json({ success: true, event, attendeeCount });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/register
// Register an attendee (name + email) for a free event
// ---------------------------------------------------------------------------
const registerAttendee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email } = req.body;

    if (!first_name || !last_name || !email) {
      throw new ApiError(400, 'Nombre, apellido y email son obligatorios', 'Datos incompletos');
    }

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }

    if (['finished', 'cancelled'].includes(event.status)) {
      throw new ApiError(400, 'El evento ya no acepta registros', 'Evento cerrado');
    }

    // Check max attendees
    if (event.max_attendees) {
      const count = await eventService.getAttendeeCount(id);
      if (count >= event.max_attendees) {
        throw new ApiError(400, 'El evento ha alcanzado el límite de asistentes', 'Aforo completo');
      }
    }

    const { attendee, accessToken, isExisting } = await eventService.registerAttendee(id, {
      first_name, last_name, email,
    });

    // Store the client IP for ban enforcement
    const clientIp = getClientIp(req);
    await eventService.updateAttendeeIp(attendee.id, clientIp);

    res.status(isExisting ? 200 : 201).json({
      success: true,
      attendee: {
        id: attendee.id,
        first_name: attendee.first_name,
        last_name: attendee.last_name,
        email: attendee.email,
        status: attendee.status,
      },
      // Only return the raw accessToken on first registration
      accessToken: isExisting ? undefined : accessToken,
      isExisting,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/pay
// Create a Stripe PaymentIntent for a paid event
// ---------------------------------------------------------------------------
const createPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { attendeeId } = req.body;

    if (!attendeeId) {
      throw new ApiError(400, 'attendeeId es obligatorio', 'Datos incompletos');
    }

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }

    if (event.access_type !== 'paid' || !event.price) {
      throw new ApiError(400, 'Este evento es gratuito', 'No requiere pago');
    }

    const attendee = await eventService.getAttendeeById(attendeeId);
    if (!attendee || attendee.event_id !== id) {
      throw new ApiError(404, 'Asistente no encontrado', 'Asistente no encontrado');
    }

    if (attendee.status === 'paid') {
      throw new ApiError(400, 'Ya has pagado este evento', 'Pago duplicado');
    }

    // Find or create Stripe customer
    const customer = await stripeService.findOrCreateCustomer({
      email: attendee.email,
      name: `${attendee.first_name} ${attendee.last_name}`,
    });

    // Amount in minor units (cents)
    const amountInCents = Math.round(event.price * 100);

    const paymentIntent = await stripeService.createPaymentIntent({
      amount: amountInCents,
      currency: (event.currency || 'EUR').toLowerCase(),
      metadata: {
        type: 'event',
        event_id: id,
        attendee_id: attendeeId,
        event_title: event.title,
      },
    });

    // Update the PI with customer
    await stripeService.updatePaymentIntent(paymentIntent.id, {
      customer: customer.id,
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      customerId: customer.id,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/confirm-payment
// Confirm payment after Stripe
// ---------------------------------------------------------------------------
const confirmPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { attendeeId, paymentIntentId } = req.body;

    if (!attendeeId || !paymentIntentId) {
      throw new ApiError(400, 'attendeeId y paymentIntentId son obligatorios', 'Datos incompletos');
    }

    const attendee = await eventService.getAttendeeById(attendeeId);
    if (!attendee || attendee.event_id !== id) {
      throw new ApiError(404, 'Asistente no encontrado', 'Asistente no encontrado');
    }

    // Verify the payment intent
    const pi = await stripeService.retrievePaymentIntent(paymentIntentId);
    if (pi.status !== 'succeeded') {
      throw new ApiError(400, 'El pago no se ha completado', 'Pago no completado');
    }

    const event = await eventService.getEventById(id);

    await eventService.updateAttendeePayment(attendeeId, {
      stripe_payment_intent_id: paymentIntentId,
      stripe_customer_id: pi.customer,
      amount_paid: event.price,
      currency: event.currency,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/token
// Get a LiveKit viewer token for an attendee
// ---------------------------------------------------------------------------
const getViewerToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { attendeeId, accessToken } = req.body;

    if (!attendeeId || !accessToken) {
      throw new ApiError(400, 'attendeeId y accessToken son obligatorios', 'Datos incompletos');
    }

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }

    if (event.status !== 'active') {
      throw new ApiError(400, 'El evento no está activo', 'Evento no activo');
    }

    // Verify attendee and access token
    const attendee = await eventService.getAttendeeByAccessToken(id, accessToken);
    if (!attendee || attendee.id !== attendeeId) {
      throw new ApiError(403, 'Token de acceso inválido', 'Acceso denegado');
    }

    // For paid events, check payment status
    if (event.access_type === 'paid' && attendee.status !== 'paid') {
      throw new ApiError(403, 'Se requiere pago para acceder', 'Pago requerido');
    }

    // Check if attendee is banned (by email or IP)
    const emailBanned = await eventService.isEmailBanned(id, attendee.email);
    if (emailBanned) {
      throw new ApiError(403, 'Has sido expulsado de este evento', 'Acceso denegado');
    }
    const clientIp = getClientIp(req);
    const ipBanned = await eventService.isIpBanned(id, clientIp);
    if (ipBanned) {
      throw new ApiError(403, 'Has sido expulsado de este evento', 'Acceso denegado');
    }

    if (!event.livekit_room_name) {
      throw new ApiError(400, 'La sala aún no está disponible', 'Sala no disponible');
    }

    const identity = `viewer-${attendee.id}`;
    const name = `${attendee.first_name} ${attendee.last_name}`;
    const token = await livekitService.generateViewerToken(event.livekit_room_name, identity, name);

    // Mark as joined
    await eventService.updateAttendeeStatus(attendeeId, 'joined');

    res.status(200).json({
      success: true,
      token,
      roomName: event.livekit_room_name,
      livekitUrl: process.env.LIVEKIT_URL,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/host-token
// Get a LiveKit host token (requires auth, seller only)
// ---------------------------------------------------------------------------
const getHostToken = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }

    if (event.status !== 'active') {
      throw new ApiError(400, 'El evento no está activo', 'Evento no activo');
    }

    // Check that the authenticated user is the host
    if (!req.user || req.user.id !== event.host_user_id) {
      throw new ApiError(403, 'Solo el host puede obtener este token', 'Acceso denegado');
    }

    if (!event.livekit_room_name) {
      throw new ApiError(400, 'La sala aún no está disponible', 'Sala no disponible');
    }

    const identity = `host-${req.user.id}`;
    const name = req.user.full_name || 'Host';
    const token = await livekitService.generateHostToken(event.livekit_room_name, identity, name);

    res.status(200).json({
      success: true,
      token,
      roomName: event.livekit_room_name,
      livekitUrl: process.env.LIVEKIT_URL,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/participants/:identity/promote
// Grant canPublish permission (host-only)
// ---------------------------------------------------------------------------
const promoteParticipant = async (req, res, next) => {
  try {
    const { id, identity } = req.params;

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }

    if (event.status !== 'active') {
      throw new ApiError(400, 'El evento no está activo', 'Evento no activo');
    }

    // Only the host can promote participants
    if (!req.user || req.user.id !== event.host_user_id) {
      throw new ApiError(403, 'Solo el host puede promover participantes', 'Acceso denegado');
    }

    if (!event.livekit_room_name) {
      throw new ApiError(400, 'La sala no está disponible', 'Sala no disponible');
    }

    await livekitService.updateParticipantPermissions(event.livekit_room_name, identity, {
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/participants/:identity/demote
// Revoke canPublish permission (host-only)
// ---------------------------------------------------------------------------
const demoteParticipant = async (req, res, next) => {
  try {
    const { id, identity } = req.params;

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }

    if (event.status !== 'active') {
      throw new ApiError(400, 'El evento no está activo', 'Evento no activo');
    }

    if (!req.user || req.user.id !== event.host_user_id) {
      throw new ApiError(403, 'Solo el host puede gestionar participantes', 'Acceso denegado');
    }

    if (!event.livekit_room_name) {
      throw new ApiError(400, 'La sala no está disponible', 'Sala no disponible');
    }

    await livekitService.updateParticipantPermissions(event.livekit_room_name, identity, {
      canPublish: false,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/events/videos/:filename
// Serve uploaded event video files
// ---------------------------------------------------------------------------
const getEventVideo = async (req, res, next) => {
  try {
    const { filename } = req.params;

    if (!/^[A-Za-z0-9_-]+\.(mp4|webm|mov)$/i.test(filename)) {
      throw new ApiError(400, 'Nombre de archivo inválido', 'Solicitud inválida');
    }

    const filePath = path.join(EVENTS_VIDEOS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Vídeo no encontrado', 'Vídeo no encontrado');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const range = req.headers.range;

    if (range) {
      // HTTP 206 Partial Content for range requests
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const stream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      stream.pipe(res);
    } else {
      // Full file response
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/participants/:identity/report-spam
// Report a spammer — kicks from LiveKit and bans by email + IP
// ---------------------------------------------------------------------------
const reportSpam = async (req, res, next) => {
  try {
    const { id, identity } = req.params;
    const { reporterAttendeeId, reporterAccessToken } = req.body;

    if (identity.startsWith('host-')) {
      throw new ApiError(400, 'No se puede reportar al host', 'Error');
    }

    const event = await eventService.getEventById(id);
    if (!event || event.status !== 'active' || !event.livekit_room_name) {
      throw new ApiError(400, 'Evento no disponible', 'Error');
    }

    // Validate reporter: valid attendee OR authenticated host (JWT)
    let isValidReporter = false;

    if (reporterAttendeeId && reporterAccessToken) {
      const reporter = await eventService.getAttendeeByAccessToken(id, reporterAccessToken);
      if (reporter && reporter.id === reporterAttendeeId) {
        isValidReporter = true;
      }
    }

    if (!isValidReporter) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
          if (decoded.id === event.host_user_id) {
            isValidReporter = true;
          }
        } catch (e) {
          // Invalid JWT
        }
      }
    }

    if (!isValidReporter) {
      throw new ApiError(403, 'No autorizado para reportar', 'Acceso denegado');
    }

    // Extract attendee ID from identity (viewer-{attendeeId})
    const spammerAttendeeId = identity.replace('viewer-', '');
    const spammer = await eventService.getAttendeeById(spammerAttendeeId);
    if (!spammer || spammer.event_id !== id) {
      throw new ApiError(404, 'Participante no encontrado', 'Error');
    }

    // Check if already banned
    const alreadyBanned = await eventService.isEmailBanned(id, spammer.email);
    if (alreadyBanned) {
      return res.status(200).json({ success: true, alreadyBanned: true });
    }

    // Ban by email and IP
    await eventService.banAttendee(id, spammer.email, spammer.ip_address, 'spam');

    // Kick from LiveKit room
    try {
      await livekitService.removeParticipant(event.livekit_room_name, identity);
    } catch (err) {
      console.warn('Error removing participant from LiveKit:', err.message);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEvents,
  getEventBySlug,
  getEventVideo,
  registerAttendee,
  createPayment,
  confirmPayment,
  getViewerToken,
  getHostToken,
  promoteParticipant,
  demoteParticipant,
  reportSpam,
};
