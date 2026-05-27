const { z } = require('zod');

const PHONE_REGEX = /^[+\d\s().-]+$/;

const artInquirySchema = z.object({
  body: z.object({
    productId: z.coerce.number().int().positive({ message: 'productId inválido' }),
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(120, 'Nombre demasiado largo'),
    email: z.string().trim().toLowerCase()
      .min(1, 'El email es obligatorio')
      .max(200, 'Email demasiado largo')
      .email('Email inválido'),
    phone: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim() : v),
      z.union([
        z.literal('').transform(() => undefined),
        z.string().max(40, 'Teléfono demasiado largo').regex(PHONE_REGEX, 'Teléfono inválido'),
        z.undefined(),
        z.null().transform(() => undefined),
      ])
    ).optional(),
    message: z.string().trim().min(1, 'El mensaje es obligatorio').max(2000, 'Mensaje demasiado largo'),
    turnstileToken: z.string().min(1, 'Token de verificación faltante').max(2000, 'Token de verificación inválido'),
  }).strip(),
});

module.exports = { artInquirySchema };
