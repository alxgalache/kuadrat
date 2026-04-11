const { z } = require('zod');

/**
 * POST /api/events/:id/register
 *
 * Controller checks: first_name, last_name, email are required.
 */
const registerAttendeeSchema = z.object({
  body: z.object({
    first_name: z.string().min(1, 'Nombre es obligatorio'),
    last_name: z.string().min(1, 'Apellido es obligatorio'),
    email: z.string().min(1, 'Email es obligatorio'),
  }).strip(),
});

/**
 * POST /api/events/:id/pay
 *
 * Controller checks: attendeeId is required.
 */
const createPaymentSchema = z.object({
  body: z.object({
    attendeeId: z.union([z.number(), z.string()]).refine(v => !!v, 'attendeeId es obligatorio'),
  }).strip(),
});

/**
 * POST /api/events/:id/confirm-payment
 *
 * Controller checks: attendeeId and paymentIntentId are required.
 */
const confirmPaymentSchema = z.object({
  body: z.object({
    attendeeId: z.union([z.number(), z.string()]).refine(v => !!v, 'attendeeId es obligatorio'),
    paymentIntentId: z.string().min(1, 'paymentIntentId es obligatorio'),
  }).strip(),
});

/**
 * POST /api/events/:id/token
 *
 * Controller checks: attendeeId and accessToken are required.
 */
const getViewerTokenSchema = z.object({
  body: z.object({
    attendeeId: z.union([z.number(), z.string()]).refine(v => !!v, 'attendeeId es obligatorio'),
    accessToken: z.string().min(1, 'accessToken es obligatorio'),
  }).strip(),
});

/**
 * POST /api/admin/events
 *
 * Controller checks: title, event_datetime, host_user_id, category are required.
 * For paid events (access_type === 'paid'), price > 0 is validated at runtime.
 */
const createEventSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Título es obligatorio'),
    description: z.string().optional(),
    event_datetime: z.string().min(1, 'Fecha del evento es obligatoria'),
    duration_minutes: z.union([z.number(), z.string()]).optional(),
    host_user_id: z.union([z.number(), z.string()]).refine(v => !!v, 'Host es obligatorio'),
    cover_image_url: z.string().optional(),
    access_type: z.string().optional(),
    price: z.union([z.number(), z.string()]).optional().nullable(),
    currency: z.string().optional(),
    format: z.string().optional(),
    content_type: z.string().optional(),
    category: z.string().min(1, 'Categoría es obligatoria'),
    video_url: z.string().optional().nullable(),
    max_attendees: z.union([z.number(), z.string()]).optional().nullable(),
    status: z.string().optional(),
  }).strip(),
});

/**
 * PUT /api/admin/events/:id
 *
 * All fields optional -- the service merges with existing values.
 */
const updateEventSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    event_datetime: z.string().optional(),
    duration_minutes: z.union([z.number(), z.string()]).optional().nullable(),
    host_user_id: z.union([z.number(), z.string()]).optional(),
    cover_image_url: z.string().optional().nullable(),
    access_type: z.string().optional(),
    price: z.union([z.number(), z.string()]).optional().nullable(),
    currency: z.string().optional(),
    format: z.string().optional(),
    content_type: z.string().optional(),
    category: z.string().optional(),
    video_url: z.string().optional().nullable(),
    max_attendees: z.union([z.number(), z.string()]).optional().nullable(),
    status: z.string().optional(),
  }).strip(),
});

/**
 * POST /api/admin/events/:id/participants/:identity/mute
 *
 * Controller reads trackSid and muted from body.
 */
const muteParticipantSchema = z.object({
  body: z.object({
    trackSid: z.string().optional(),
    muted: z.boolean().optional(),
  }).strip(),
});

/**
 * POST /api/events/:id/send-verification
 */
const sendVerificationSchema = z.object({
  body: z.object({
    attendeeId: z.union([z.number(), z.string()]).refine(v => !!v, 'attendeeId es obligatorio'),
  }).strip(),
});

/**
 * POST /api/events/:id/verify-email
 */
const verifyEmailSchema = z.object({
  body: z.object({
    attendeeId: z.union([z.number(), z.string()]).refine(v => !!v, 'attendeeId es obligatorio'),
    code: z.string().length(6, 'El código debe tener 6 dígitos'),
  }).strip(),
});

/**
 * POST /api/events/:id/verify-password
 */
const verifyPasswordSchema = z.object({
  body: z.object({
    email: z.string().min(1, 'Email es obligatorio'),
    password: z.string().min(1, 'Contraseña es obligatoria'),
  }).strip(),
});

/**
 * POST /api/admin/events/:id/mark-finished
 *
 * Change #3 — admin fallback for setting `events.finished_at` when the host
 * never triggered the end-of-event endpoint.
 */
const markEventFinishedSchema = z.object({
  body: z.object({
    finished_at: z.string().datetime({ offset: true }).optional(),
  }).strip(),
});

/**
 * POST /api/admin/events/:id/exclude-credit
 *
 * Change #3 — flag a paid event so the credit scheduler skips it. Body carries
 * a mandatory short reason for audit logging.
 */
const excludeEventCreditSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Motivo obligatorio').max(500, 'Motivo demasiado largo'),
  }).strip(),
});

module.exports = {
  registerAttendeeSchema,
  createPaymentSchema,
  confirmPaymentSchema,
  getViewerTokenSchema,
  createEventSchema,
  updateEventSchema,
  muteParticipantSchema,
  sendVerificationSchema,
  verifyEmailSchema,
  verifyPasswordSchema,
  markEventFinishedSchema,
  excludeEventCreditSchema,
};
