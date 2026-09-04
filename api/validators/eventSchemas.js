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
 * Cross-field rule for the streaming provider (design D8): meeting mode is
 * Agora-only and requires a capped capacity (Agora hard limit: 17 simultaneous
 * video senders → max_attendees ≤ 16). Runs on whatever the body carries; the
 * admin controller re-validates the merged state on update.
 */
function validateProviderRules(body, ctx) {
  if (body.interaction_mode !== 'meeting') return;
  if (body.provider !== 'agora') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['interaction_mode'],
      message: 'El modo reunión requiere el proveedor Agora',
    });
  }
  const capacity = body.max_attendees != null && body.max_attendees !== ''
    ? parseInt(body.max_attendees, 10)
    : NaN;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['max_attendees'],
      message: 'El modo reunión requiere un aforo entre 1 y 16 asistentes',
    });
  }
}

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
    // The admin form serializes empty optionals as null (e.g. `value || null`,
    // and NaN → null through JSON), so these must be nullable besides optional.
    duration_minutes: z.union([z.number(), z.string()]).optional().nullable(),
    host_user_id: z.union([z.number(), z.string()]).refine(v => !!v, 'Host es obligatorio'),
    cover_image_url: z.string().optional().nullable(),
    access_type: z.string().optional(),
    price: z.union([z.number(), z.string()]).optional().nullable(),
    currency: z.string().optional(),
    format: z.string().optional(),
    content_type: z.string().optional(),
    category: z.string().min(1, 'Categoría es obligatoria'),
    video_url: z.string().optional().nullable(),
    max_attendees: z.union([z.number(), z.string()]).optional().nullable(),
    status: z.string().optional(),
    provider: z.enum(['livekit', 'agora'], { message: 'Proveedor de streaming inválido' }).optional(),
    interaction_mode: z.enum(['broadcast', 'meeting'], { message: 'Modo de interacción inválido' }).optional(),
    // Consola móvil del host. Se acepta el entero además del booleano porque el
    // formulario de edición recibe el valor tal cual sale de SQLite (0 | 1) y
    // podría devolverlo sin convertir; cualquier otra cosa se rechaza aquí, no
    // se normaliza en silencio.
    allow_mobile_host_console: z.union([
      z.boolean(),
      z.literal(0),
      z.literal(1),
    ], { message: 'Valor inválido para la consola móvil del host' }).optional(),
  }).strip().superRefine(validateProviderRules),
});

/**
 * Partial-update variant: only flags fields actually present in the body
 * (a PUT may legitimately omit provider/max_attendees for an event that is
 * already valid). The merged state is re-validated in eventAdminController.
 */
function validateProviderRulesPartial(body, ctx) {
  if (body.interaction_mode !== 'meeting') return;
  if (body.provider !== undefined && body.provider !== 'agora') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['interaction_mode'],
      message: 'El modo reunión requiere el proveedor Agora',
    });
  }
  if (body.max_attendees !== undefined) {
    const capacity = body.max_attendees != null && body.max_attendees !== ''
      ? parseInt(body.max_attendees, 10)
      : NaN;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max_attendees'],
        message: 'El modo reunión requiere un aforo entre 1 y 16 asistentes',
      });
    }
  }
}

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
    provider: z.enum(['livekit', 'agora'], { message: 'Proveedor de streaming inválido' }).optional(),
    interaction_mode: z.enum(['broadcast', 'meeting'], { message: 'Modo de interacción inválido' }).optional(),
    allow_mobile_host_console: z.union([
      z.boolean(),
      z.literal(0),
      z.literal(1),
    ], { message: 'Valor inválido para la consola móvil del host' }).optional(),
  }).strip().superRefine(validateProviderRulesPartial),
});

/**
 * POST /api/events/:id/renew-token
 *
 * Agora events: re-issues an RTC token for the caller's current role.
 * Credentials: attendeeId+accessToken in the body, OR a host/admin JWT in the
 * Authorization header (both optional here; the controller validates the
 * combination).
 */
const renewTokenSchema = z.object({
  body: z.object({
    attendeeId: z.union([z.number(), z.string()]).optional(),
    accessToken: z.string().optional(),
  }).strip(),
});

/**
 * POST /api/events/:id/whiteboard-token
 *
 * Agora events, optional whiteboard phase. Same credential model as
 * /renew-token: attendee credentials in the body or host/admin JWT.
 */
const whiteboardTokenSchema = z.object({
  body: z.object({
    attendeeId: z.union([z.number(), z.string()]).optional(),
    accessToken: z.string().optional(),
  }).strip(),
});

/**
 * POST /api/events/:id/whiteboard-image
 *
 * Multipart upload (fields arrive as strings). Same credential model as
 * /whiteboard-token; the image file itself is validated by multer + controller.
 */
const whiteboardImageSchema = z.object({
  body: z.object({
    attendeeId: z.union([z.number(), z.string()]).optional(),
    accessToken: z.string().optional(),
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
  renewTokenSchema,
  whiteboardTokenSchema,
  whiteboardImageSchema,
  createEventSchema,
  updateEventSchema,
  muteParticipantSchema,
  sendVerificationSchema,
  verifyEmailSchema,
  verifyPasswordSchema,
  markEventFinishedSchema,
  excludeEventCreditSchema,
};
