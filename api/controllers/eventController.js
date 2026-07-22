const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { ApiError } = require('../middleware/errorHandler');
const config = require('../config/env');
const logger = require('../config/logger');
const eventService = require('../services/eventService');
const livekitService = require('../services/livekitService');
const agoraService = require('../services/agoraService');
const whiteboardService = require('../services/whiteboardService');
const s3Service = require('../services/s3Service');
const stripeService = require('../services/stripeService');
const { sendEventVerificationEmail, sendEventConfirmationEmail } = require('../services/emailService');

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
    res.status(200).json({
      success: true,
      event,
      attendeeCount,
      serverNow: new Date().toISOString(),
    });
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

    if (['paid', 'joined'].includes(attendee.status)) {
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

    // Generate password and send confirmation email for paid events
    const password = eventService.generateEventPassword();
    await eventService.setAttendeePassword(attendeeId, password);

    sendEventConfirmationEmail({
      email: attendee.email,
      firstName: attendee.first_name,
      eventTitle: event.title,
      accessPassword: password,
      amountPaid: event.price,
    }).catch(err => logger.error({ err }, 'Error sending event confirmation email'));

    res.status(200).json({ success: true, accessPassword: password });
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
    if (event.access_type === 'paid' && !['paid', 'joined'].includes(attendee.status)) {
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

    // ── Agora branch ─────────────────────────────────────────
    if (event.provider === 'agora') {
      if (!event.agora_channel_name) {
        throw new ApiError(400, 'La sala aún no está disponible', 'Sala no disponible');
      }

      const uid = await agoraService.ensureAttendeeUid(id, attendee.id);
      // meeting: everyone publishes (enters muted/cam-off client-side);
      // broadcast: role follows the persisted promotion state. Chat bans do
      // NOT affect the RTC token — chat runs on our Socket.IO room.
      const role = event.interaction_mode === 'meeting' || attendee.speaker_granted === 1
        ? 'publisher'
        : 'subscriber';
      const rtcToken = agoraService.generateRtcToken({
        channel: event.agora_channel_name,
        uid,
        role,
      });

      // Mark as joined
      await eventService.updateAttendeeStatus(attendeeId, 'joined');

      return res.status(200).json({
        success: true,
        provider: 'agora',
        appId: config.agora.appId,
        channel: event.agora_channel_name,
        uid,
        rtcToken,
        interactionMode: event.interaction_mode,
        whiteboardAvailable: whiteboardService.isConfigured(),
      });
    }

    // ── LiveKit branch (unchanged) ───────────────────────────
    if (!event.livekit_room_name) {
      throw new ApiError(400, 'La sala aún no está disponible', 'Sala no disponible');
    }

    // Check if attendee is chat-banned (issue token with canPublishData=false)
    const chatBanned = await eventService.isAttendeeChatBanned(attendeeId);

    const identity = `viewer-${attendee.id}`;
    const name = `${attendee.first_name} ${attendee.last_name}`;
    const token = await livekitService.generateViewerToken(event.livekit_room_name, identity, name, { chatBanned });

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

    // ── Agora branch ─────────────────────────────────────────
    if (event.provider === 'agora') {
      if (!event.agora_channel_name) {
        throw new ApiError(400, 'La sala aún no está disponible', 'Sala no disponible');
      }

      const rtcToken = agoraService.generateRtcToken({
        channel: event.agora_channel_name,
        uid: agoraService.HOST_UID,
        role: 'publisher',
      });

      return res.status(200).json({
        success: true,
        provider: 'agora',
        appId: config.agora.appId,
        channel: event.agora_channel_name,
        uid: agoraService.HOST_UID,
        rtcToken,
        interactionMode: event.interaction_mode,
        whiteboardAvailable: whiteboardService.isConfigured(),
      });
    }

    // ── LiveKit branch (unchanged) ───────────────────────────
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
// POST /api/events/:id/renew-token
// Agora events: re-issue an RTC token for the caller's CURRENT role. Called by
// the client on token-privilege-will-expire and after promote/demote. Accepts
// attendee credentials in the body or a host/admin JWT in the header.
// ---------------------------------------------------------------------------
const renewToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { attendeeId, accessToken } = req.body;

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }
    if (event.provider !== 'agora') {
      throw new ApiError(400, 'Este evento no admite renovación de token', 'Solicitud inválida');
    }
    if (event.status !== 'active') {
      throw new ApiError(400, 'El evento no está activo', 'Evento no activo');
    }
    if (!event.agora_channel_name) {
      throw new ApiError(400, 'La sala no está disponible', 'Sala no disponible');
    }

    // Attendee path: same re-validations as the token endpoint
    if (attendeeId && accessToken) {
      const attendee = await eventService.getAttendeeByAccessToken(id, accessToken);
      if (!attendee || attendee.id !== attendeeId) {
        throw new ApiError(403, 'Token de acceso inválido', 'Acceso denegado');
      }
      if (event.access_type === 'paid' && !['paid', 'joined'].includes(attendee.status)) {
        throw new ApiError(403, 'Se requiere pago para acceder', 'Pago requerido');
      }
      if (await eventService.isEmailBanned(id, attendee.email)) {
        throw new ApiError(403, 'Has sido expulsado de este evento', 'Acceso denegado');
      }
      if (await eventService.isIpBanned(id, getClientIp(req))) {
        throw new ApiError(403, 'Has sido expulsado de este evento', 'Acceso denegado');
      }

      const uid = await agoraService.ensureAttendeeUid(id, attendee.id);
      const role = event.interaction_mode === 'meeting' || attendee.speaker_granted === 1
        ? 'publisher'
        : 'subscriber';
      const rtcToken = agoraService.generateRtcToken({
        channel: event.agora_channel_name,
        uid,
        role,
      });

      return res.status(200).json({
        success: true,
        provider: 'agora',
        appId: config.agora.appId,
        channel: event.agora_channel_name,
        uid,
        rtcToken,
        role,
        interactionMode: event.interaction_mode,
      });
    }

    // Host/admin path: JWT in the Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      let decoded;
      try {
        decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      } catch {
        throw new ApiError(403, 'Credenciales inválidas', 'Acceso denegado');
      }
      if (decoded.id !== event.host_user_id && decoded.role !== 'admin') {
        throw new ApiError(403, 'Solo el host puede renovar este token', 'Acceso denegado');
      }

      const rtcToken = agoraService.generateRtcToken({
        channel: event.agora_channel_name,
        uid: agoraService.HOST_UID,
        role: 'publisher',
      });

      return res.status(200).json({
        success: true,
        provider: 'agora',
        appId: config.agora.appId,
        channel: event.agora_channel_name,
        uid: agoraService.HOST_UID,
        rtcToken,
        role: 'publisher',
        interactionMode: event.interaction_mode,
      });
    }

    throw new ApiError(403, 'Credenciales requeridas', 'Acceso denegado');
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/whiteboard-token
// Agora events, optional whiteboard phase. Host (JWT): writer token + lazy
// room creation. Attendees: reader (broadcast) or writer when the host
// enabled "everyone writes" in meeting mode; requires the whiteboard to be
// active (toggle state lives in the Socket.IO room).
// ---------------------------------------------------------------------------
const getWhiteboardToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { attendeeId, accessToken } = req.body;

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }
    if (event.provider !== 'agora') {
      throw new ApiError(400, 'Este evento no admite pizarra', 'Solicitud inválida');
    }
    if (event.status !== 'active') {
      throw new ApiError(400, 'El evento no está activo', 'Evento no activo');
    }
    if (!whiteboardService.isConfigured()) {
      throw new ApiError(503, 'La pizarra interactiva no está configurada', 'Pizarra no disponible');
    }

    const { appIdentifier, region } = config.agoraWhiteboard;

    // Host/admin path: writer token + lazy room creation on first activation
    const authHeader = req.headers.authorization;
    if (!attendeeId && authHeader?.startsWith('Bearer ')) {
      let decoded;
      try {
        decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      } catch {
        throw new ApiError(403, 'Credenciales inválidas', 'Acceso denegado');
      }
      if (decoded.id !== event.host_user_id && decoded.role !== 'admin') {
        throw new ApiError(403, 'Solo el host puede activar la pizarra', 'Acceso denegado');
      }

      const uuid = await whiteboardService.ensureRoom(event);
      return res.status(200).json({
        success: true,
        appIdentifier,
        region,
        uuid,
        roomToken: whiteboardService.generateRoomToken(uuid, 'writer'),
        role: 'writer',
        uid: `host-${decoded.id}`,
      });
    }

    // Attendee path: same re-validations as the token endpoint
    if (!attendeeId || !accessToken) {
      throw new ApiError(403, 'Credenciales requeridas', 'Acceso denegado');
    }
    const attendee = await eventService.getAttendeeByAccessToken(id, accessToken);
    if (!attendee || attendee.id !== attendeeId) {
      throw new ApiError(403, 'Token de acceso inválido', 'Acceso denegado');
    }
    if (event.access_type === 'paid' && !['paid', 'joined'].includes(attendee.status)) {
      throw new ApiError(403, 'Se requiere pago para acceder', 'Pago requerido');
    }
    if (await eventService.isEmailBanned(id, attendee.email)) {
      throw new ApiError(403, 'Has sido expulsado de este evento', 'Acceso denegado');
    }
    if (await eventService.isIpBanned(id, getClientIp(req))) {
      throw new ApiError(403, 'Has sido expulsado de este evento', 'Acceso denegado');
    }

    // The host activates first (creating the room); attendees need it active
    const eventSocket = req.app.get('eventSocket');
    const wbState = eventSocket?.getWhiteboardState(id) || { active: false, everyoneWrites: false };
    if (!wbState.active || !event.whiteboard_room_uuid) {
      throw new ApiError(400, 'La pizarra no está activa', 'Pizarra no disponible');
    }

    const role = event.interaction_mode === 'meeting' && wbState.everyoneWrites ? 'writer' : 'reader';
    return res.status(200).json({
      success: true,
      appIdentifier,
      region,
      uuid: event.whiteboard_room_uuid,
      roomToken: whiteboardService.generateRoomToken(event.whiteboard_room_uuid, role),
      role,
      uid: `viewer-${attendee.id}`,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/whiteboard-image
// Upload an image to insert into the active whiteboard. Same credential model
// as whiteboard-token; only effective writers may upload (host always,
// attendees when "everyone writes" is on in meeting mode). Stored under the
// whiteboard/ prefix with a UUID name (S3 when configured, local disk
// otherwise), no DB row — the returned public URL is the only reference.
// ---------------------------------------------------------------------------
const WHITEBOARD_IMAGES_DIR = path.join(__dirname, '..', 'uploads', 'whiteboard');
const WHITEBOARD_IMAGE_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const uploadWhiteboardImage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { attendeeId, accessToken } = req.body;

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }
    if (event.provider !== 'agora') {
      throw new ApiError(400, 'Este evento no admite pizarra', 'Solicitud inválida');
    }
    if (event.status !== 'active') {
      throw new ApiError(400, 'El evento no está activo', 'Evento no activo');
    }

    const eventSocket = req.app.get('eventSocket');
    const wbState = eventSocket?.getWhiteboardState(id) || { active: false, everyoneWrites: false };
    if (!wbState.active) {
      throw new ApiError(400, 'La pizarra no está activa', 'Pizarra no disponible');
    }

    // Writer check — host/admin path (JWT) or attendee path (access token)
    const authHeader = req.headers.authorization;
    if (!attendeeId && authHeader?.startsWith('Bearer ')) {
      let decoded;
      try {
        decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      } catch {
        throw new ApiError(403, 'Credenciales inválidas', 'Acceso denegado');
      }
      if (decoded.id !== event.host_user_id && decoded.role !== 'admin') {
        throw new ApiError(403, 'Solo el host puede subir imágenes a la pizarra', 'Acceso denegado');
      }
    } else {
      if (!attendeeId || !accessToken) {
        throw new ApiError(403, 'Credenciales requeridas', 'Acceso denegado');
      }
      const attendee = await eventService.getAttendeeByAccessToken(id, accessToken);
      // Multipart form fields always arrive as strings — compare loosely
      if (!attendee || String(attendee.id) !== String(attendeeId)) {
        throw new ApiError(403, 'Token de acceso inválido', 'Acceso denegado');
      }
      if (event.access_type === 'paid' && !['paid', 'joined'].includes(attendee.status)) {
        throw new ApiError(403, 'Se requiere pago para acceder', 'Pago requerido');
      }
      if (await eventService.isEmailBanned(id, attendee.email)) {
        throw new ApiError(403, 'Has sido expulsado de este evento', 'Acceso denegado');
      }
      if (await eventService.isIpBanned(id, getClientIp(req))) {
        throw new ApiError(403, 'Has sido expulsado de este evento', 'Acceso denegado');
      }
      // Attendees are writers only while "everyone writes" is on (meeting)
      if (!(event.interaction_mode === 'meeting' && wbState.everyoneWrites)) {
        throw new ApiError(403, 'No tienes permiso de escritura en la pizarra', 'Acceso denegado');
      }
    }

    const file = req.file;
    if (!file) {
      throw new ApiError(400, 'No se recibió ninguna imagen', 'Solicitud inválida');
    }
    const ext = WHITEBOARD_IMAGE_EXTENSIONS[file.mimetype];
    if (!ext) {
      throw new ApiError(400, 'Solo se permiten imágenes PNG, JPG o WEBP', 'Solicitud inválida');
    }

    const basename = `${crypto.randomUUID()}.${ext}`;
    if (config.useS3) {
      await s3Service.uploadFile(`whiteboard/${basename}`, file.buffer, file.mimetype);
    } else {
      await fs.promises.mkdir(WHITEBOARD_IMAGES_DIR, { recursive: true });
      await fs.promises.writeFile(path.join(WHITEBOARD_IMAGES_DIR, basename), file.buffer);
    }

    // Absolute URL loadable by every participant's browser: CDN when media is
    // on S3, otherwise this API's own public serving endpoint (the request
    // origin is exactly what all clients use to reach the API)
    const url = config.cdnBaseUrl
      ? `${config.cdnBaseUrl}/whiteboard/${encodeURIComponent(basename)}`
      : `${req.protocol}://${req.get('host')}/api/events/whiteboard-images/${encodeURIComponent(basename)}`;

    logger.info({ eventId: id, basename }, 'Whiteboard image uploaded');
    return res.status(201).json({ success: true, url });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/events/whiteboard-images/:basename
// Public read endpoint for locally stored whiteboard images (with S3 the URLs
// point at the CDN instead, mirroring the product image pattern)
// ---------------------------------------------------------------------------
const getWhiteboardImage = async (req, res, next) => {
  try {
    const { basename } = req.params;
    if (!/^[A-Za-z0-9-]+\.(png|jpg|webp)$/.test(basename)) {
      throw new ApiError(400, 'Nombre de imagen inválido', 'Solicitud inválida');
    }
    const filePath = path.join(WHITEBOARD_IMAGES_DIR, basename);
    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Imagen no encontrada', 'Imagen no encontrada');
    }
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/end
// End an event and clean up the LiveKit room (host only)
// ---------------------------------------------------------------------------
const endEvent = async (req, res, next) => {
  try {
    const current = await eventService.getEventById(req.params.id);
    if (!current) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }

    if (current.status !== 'active') {
      throw new ApiError(400, 'Solo se pueden finalizar eventos activos', 'No se puede finalizar');
    }

    // Check that the authenticated user is the host
    if (!req.user || req.user.id !== current.host_user_id) {
      throw new ApiError(403, 'Solo el host puede finalizar este evento', 'Acceso denegado');
    }

    // Delete LiveKit room (only for live format LiveKit events; Agora channels
    // are implicit — nothing to delete, clients leave() on event_ended)
    if (current.format !== 'video' && current.provider !== 'agora' && current.livekit_room_name) {
      try {
        await livekitService.deleteRoom(current.livekit_room_name);
      } catch (lkError) {
        logger.error({ err: lkError }, 'Error deleting LiveKit room');
        // Don't fail, continue ending the event
      }
    }

    const event = await eventService.endEvent(req.params.id);

    // Notify clients that the event has ended
    const eventSocket = req.app.get('eventSocket');
    if (eventSocket) {
      eventSocket.broadcastEventEnded(req.params.id);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Agora moderation helpers (shared with eventAdminController)
// Promotion state persists in event_attendees.speaker_granted (drives token
// renewals); the kicking rule is belt-and-braces enforcement (design D5/R2),
// so REST failures are logged but never block the flow. Socket signals tell
// the target client to renew its token and (un)publish.
// ---------------------------------------------------------------------------
async function resolveAgoraAttendee(event, identity) {
  if (!identity.startsWith('viewer-')) {
    throw new ApiError(400, 'Participante inválido', 'Solicitud inválida');
  }
  const attendeeId = identity.replace('viewer-', '');
  const attendee = await eventService.getAttendeeById(attendeeId);
  if (!attendee || attendee.event_id !== event.id) {
    throw new ApiError(404, 'Participante no encontrado', 'Error');
  }
  return attendee;
}

async function promoteAgoraParticipant(app, event, identity) {
  const attendee = await resolveAgoraAttendee(event, identity);

  await eventService.setSpeakerGranted(attendee.id, true);

  if (attendee.agora_uid != null) {
    try {
      await agoraService.liftPublishBan(event.agora_channel_name, Number(attendee.agora_uid));
    } catch (err) {
      logger.warn({ err, identity }, '[eventController] Could not lift Agora publish ban');
    }
  }

  const eventSocket = app.get('eventSocket');
  if (eventSocket) eventSocket.notifyPromoted(event.id, identity);
}

async function demoteAgoraParticipant(app, event, identity) {
  const attendee = await resolveAgoraAttendee(event, identity);

  await eventService.setSpeakerGranted(attendee.id, false);

  if (attendee.agora_uid != null) {
    try {
      await agoraService.banPublish(event.agora_channel_name, Number(attendee.agora_uid));
    } catch (err) {
      logger.warn({ err, identity }, '[eventController] Could not create Agora publish ban');
    }
  }

  const eventSocket = app.get('eventSocket');
  if (eventSocket) eventSocket.notifyDemoted(event.id, identity);
}

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

    // ── Agora branch ─────────────────────────────────────────
    if (event.provider === 'agora') {
      await promoteAgoraParticipant(req.app, event, identity);
      return res.status(200).json({ success: true });
    }

    // ── LiveKit branch (unchanged) ───────────────────────────
    if (!event.livekit_room_name) {
      throw new ApiError(400, 'La sala no está disponible', 'Sala no disponible');
    }

    await livekitService.updateParticipantPermissions(event.livekit_room_name, identity, {
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateMetadata: true,
    }, { handRaised: '' });

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

    // ── Agora branch ─────────────────────────────────────────
    if (event.provider === 'agora') {
      await demoteAgoraParticipant(req.app, event, identity);
      return res.status(200).json({ success: true });
    }

    // ── LiveKit branch (unchanged) ───────────────────────────
    if (!event.livekit_room_name) {
      throw new ApiError(400, 'La sala no está disponible', 'Sala no disponible');
    }

    await livekitService.updateParticipantPermissions(event.livekit_room_name, identity, {
      canPublish: false,
      canSubscribe: true,
      canPublishData: true,
      canUpdateMetadata: true,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Helpers for signed video tokens
// ---------------------------------------------------------------------------
function createVideoToken(eventId, subject) {
  const expiry = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
  const payload = `${eventId}:${subject}:${expiry}`;
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifyVideoToken(token, eventId) {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    // Format: eventId:subject:expiry:hexsig — hex has no colons, UUIDs have no colons
    const parts = raw.split(':');
    if (parts.length !== 4) return null;
    const [tEventId, tSubject, tExpiry, tSig] = parts;
    if (tEventId !== eventId) return null;
    if (Date.now() > parseInt(tExpiry, 10)) return null;
    const payload = `${tEventId}:${tSubject}:${tExpiry}`;
    const expected = crypto.createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(tSig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return { eventId: tEventId, subject: tSubject };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// POST /api/events/:id/video-token
// Get a short-lived signed token to access the event video
// ---------------------------------------------------------------------------
const getVideoToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { attendeeId, accessToken } = req.body;

    const event = await eventService.getEventById(id);
    if (!event || event.format !== 'video' || !event.video_url) {
      throw new ApiError(400, 'No hay vídeo disponible para este evento', 'Error');
    }

    if (!['active', 'finished'].includes(event.status)) {
      throw new ApiError(400, 'El evento no está disponible', 'Error');
    }

    let subject = null;

    // Try attendee credentials from body
    if (attendeeId && accessToken) {
      const attendee = await eventService.getAttendeeByAccessToken(id, accessToken);
      if (attendee && attendee.id === attendeeId) {
        if (event.access_type === 'paid' && !['paid', 'joined'].includes(attendee.status)) {
          throw new ApiError(403, 'Se requiere pago para acceder al vídeo', 'Pago requerido');
        }
        subject = attendeeId;
      }
    }

    // Fall back to host/admin JWT
    if (!subject) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
          if (decoded.id === event.host_user_id || decoded.role === 'admin') {
            subject = `host-${decoded.id}`;
          }
        } catch { /* invalid JWT */ }
      }
    }

    if (!subject) {
      throw new ApiError(403, 'No tienes acceso a este vídeo', 'Acceso denegado');
    }

    const vtoken = createVideoToken(id, subject);
    const filename = event.video_url.replace('uploaded:', '');

    res.status(200).json({ success: true, vtoken, filename });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/events/:id/video/:filename
// Serve uploaded event video files (requires valid signed vtoken query param)
// ---------------------------------------------------------------------------
const getEventVideo = async (req, res, next) => {
  try {
    const { id, filename } = req.params;
    const { vtoken } = req.query;

    // Validate signed token
    if (!vtoken) {
      throw new ApiError(401, 'Token de acceso requerido', 'No autorizado');
    }
    const decoded = verifyVideoToken(vtoken, id);
    if (!decoded) {
      throw new ApiError(401, 'Token inválido o expirado', 'No autorizado');
    }

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
        'Cache-Control': 'no-store',
        'Content-Disposition': 'inline',
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Disposition': 'inline',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/participants/:identity/ban-from-chat
// Host bans a participant from the chat (no kick, stays in room)
// ---------------------------------------------------------------------------
const banFromChat = async (req, res, next) => {
  try {
    const { id, identity } = req.params;

    if (identity.startsWith('host-')) {
      throw new ApiError(400, 'No se puede expulsar al host del chat', 'Error');
    }

    const event = await eventService.getEventById(id);
    const roomAvailable = event?.provider === 'agora'
      ? !!event?.agora_channel_name
      : !!event?.livekit_room_name;
    if (!event || event.status !== 'active' || !roomAvailable) {
      throw new ApiError(400, 'Evento no disponible', 'Error');
    }

    // Only host or admin can ban from chat
    if (!req.user || (req.user.id !== event.host_user_id && req.user.role !== 'admin')) {
      throw new ApiError(403, 'Solo el host puede expulsar del chat', 'Acceso denegado');
    }

    // Extract attendeeId from identity (viewer-{attendeeId})
    const attendeeId = identity.replace('viewer-', '');
    const attendee = await eventService.getAttendeeById(attendeeId);
    if (!attendee || attendee.event_id !== id) {
      throw new ApiError(404, 'Participante no encontrado', 'Error');
    }

    // Already chat-banned?
    const alreadyBanned = await eventService.isAttendeeChatBanned(attendeeId);
    if (alreadyBanned) {
      return res.status(200).json({ success: true, alreadyBanned: true });
    }

    if (event.provider === 'agora') {
      // Agora: the chat runs on our Socket.IO room — persist and broadcast,
      // the socket server enforces the ban on every message
      await eventService.markAttendeeChatBanned(attendeeId);
      const eventSocket = req.app.get('eventSocket');
      if (eventSocket) eventSocket.notifyChatBanned(id, identity);
      return res.status(200).json({ success: true });
    }

    // Revoke canPublishData in LiveKit
    try {
      await livekitService.updateParticipantPermissions(event.livekit_room_name, identity, {
        canPublish: false,
        canSubscribe: true,
        canPublishData: false,
        canUpdateMetadata: true,
      });
    } catch (err) {
      logger.warn({ err }, 'Error updating participant permissions in LiveKit');
    }

    // Persist in DB
    await eventService.markAttendeeChatBanned(attendeeId);

    res.status(200).json({ success: true });
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
    const roomAvailable = event?.provider === 'agora'
      ? !!event?.agora_channel_name
      : !!event?.livekit_room_name;
    if (!event || event.status !== 'active' || !roomAvailable) {
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

    // Check if already chat-banned
    const alreadyChatBanned = await eventService.isAttendeeChatBanned(spammerAttendeeId);
    if (alreadyChatBanned) {
      return res.status(200).json({ success: true, alreadyBanned: true });
    }

    if (event.provider === 'agora') {
      // Agora: persist + broadcast; the Socket.IO chat server enforces the ban
      await eventService.markAttendeeChatBanned(spammerAttendeeId);
      await eventService.banAttendee(id, spammer.email, spammer.ip_address, 'spam');
      const eventSocket = req.app.get('eventSocket');
      if (eventSocket) eventSocket.notifyChatBanned(id, identity);
      return res.status(200).json({ success: true });
    }

    // Chat-ban: revoke canPublishData in LiveKit (stays in room, can't chat)
    try {
      await livekitService.updateParticipantPermissions(event.livekit_room_name, identity, {
        canPublish: false,
        canSubscribe: true,
        canPublishData: false,
        canUpdateMetadata: true,
      });
    } catch (err) {
      logger.warn({ err }, 'Error updating participant permissions in LiveKit');
    }

    // Persist chat ban in DB (survives reconnection)
    await eventService.markAttendeeChatBanned(spammerAttendeeId);

    // Also record in event_bans for email+IP tracking (prevents token re-issuance with chat)
    await eventService.banAttendee(id, spammer.email, spammer.ip_address, 'spam');

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/send-verification
// Send OTP code to attendee's email
// ---------------------------------------------------------------------------
const sendVerification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { attendeeId } = req.body;

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }

    const result = await eventService.sendVerificationCode(id, attendeeId);
    if (!result) {
      throw new ApiError(404, 'Asistente no encontrado', 'Asistente no encontrado');
    }

    await sendEventVerificationEmail({ email: result.attendee.email, code: result.code });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/verify-email
// Verify OTP code
// ---------------------------------------------------------------------------
const verifyEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { attendeeId, code } = req.body;

    const result = await eventService.verifyEmailCode(id, attendeeId, code);
    if (!result.valid) {
      throw new ApiError(400, result.error, 'Verificación fallida');
    }

    // For free events, generate password and send confirmation email now
    const event = await eventService.getEventById(id);
    if (event && event.access_type !== 'paid') {
      const attendee = await eventService.getAttendeeById(attendeeId);
      const password = eventService.generateEventPassword();
      await eventService.setAttendeePassword(attendeeId, password);

      sendEventConfirmationEmail({
        email: attendee.email,
        firstName: attendee.first_name,
        eventTitle: event.title,
        accessPassword: password,
      }).catch(err => logger.error({ err }, 'Error sending event confirmation email'));

      return res.status(200).json({ success: true, accessPassword: password });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/verify-password
// Verify email + password for returning attendees
// ---------------------------------------------------------------------------
const verifyPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, password } = req.body;

    const event = await eventService.getEventById(id);
    if (!event) {
      throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');
    }

    const result = await eventService.verifyAttendeePassword(id, email, password);
    if (!result.found) {
      const statusCode = result.error === 'Contraseña incorrecta' ? 401 : 404;
      throw new ApiError(statusCode, result.error, result.error);
    }

    res.status(200).json({
      success: true,
      attendee: {
        id: result.attendee.id,
        first_name: result.attendee.first_name,
        last_name: result.attendee.last_name,
        email: result.attendee.email,
        status: result.attendee.status,
      },
      accessToken: result.accessToken,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEvents,
  getEventBySlug,
  getVideoToken,
  getEventVideo,
  registerAttendee,
  createPayment,
  confirmPayment,
  getViewerToken,
  getHostToken,
  renewToken,
  getWhiteboardToken,
  uploadWhiteboardImage,
  getWhiteboardImage,
  endEvent,
  promoteParticipant,
  demoteParticipant,
  reportSpam,
  banFromChat,
  sendVerification,
  verifyEmail,
  verifyPassword,
  // Agora moderation helpers (reused by eventAdminController)
  promoteAgoraParticipant,
  demoteAgoraParticipant,
};
