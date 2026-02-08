const { ApiError } = require('../middleware/errorHandler');
const eventService = require('../services/eventService');
const livekitService = require('../services/livekitService');
const stripeService = require('../services/stripeService');

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

module.exports = {
  getEvents,
  getEventBySlug,
  registerAttendee,
  createPayment,
  confirmPayment,
  getViewerToken,
  getHostToken,
};
