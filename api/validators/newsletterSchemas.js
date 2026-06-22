const { z } = require('zod');

// Public newsletter signup. firstName required; lastName optional; email
// normalized; at least one topic; Turnstile token required. Topic IDs are
// validated for shape only — the service filters them against the known
// (configured) topics and ignores anything unrecognised.
const newsletterSubscribeSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(120, 'Nombre demasiado largo'),
    lastName: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim() : v),
      z.union([
        z.literal('').transform(() => undefined),
        z.string().max(120, 'Apellidos demasiado largos'),
        z.undefined(),
        z.null().transform(() => undefined),
      ])
    ).optional(),
    email: z.string().trim().toLowerCase()
      .min(1, 'El email es obligatorio')
      .max(200, 'Email demasiado largo')
      .email('Email inválido'),
    topics: z.array(z.string().trim().min(1).max(100))
      .min(1, 'Selecciona al menos un tema')
      .max(20, 'Demasiados temas'),
    turnstileToken: z.string().min(1, 'Token de verificación faltante').max(2000, 'Token de verificación inválido'),
  }).strip(),
});

module.exports = { newsletterSubscribeSchema };
