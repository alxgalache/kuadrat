const { z } = require('zod');

/**
 * POST /api/draws/:id/register-buyer
 */
const registerBuyerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'Nombre es obligatorio'),
    lastName: z.string().min(1, 'Apellido es obligatorio'),
    email: z.string().min(1, 'Email es obligatorio'),
    dni: z.string().min(1, 'DNI es obligatorio'),
    deliveryAddress1: z.string().optional(),
    deliveryAddress2: z.string().optional(),
    deliveryPostalCode: z.string().optional(),
    deliveryCity: z.string().optional(),
    deliveryProvince: z.string().optional(),
    deliveryCountry: z.string().optional(),
    invoicingAddress1: z.string().optional(),
    invoicingAddress2: z.string().optional(),
    invoicingPostalCode: z.string().optional(),
    invoicingCity: z.string().optional(),
    invoicingProvince: z.string().optional(),
    invoicingCountry: z.string().optional(),
  }).strip(),
});

/**
 * POST /api/draws/:id/send-verification
 */
const sendVerificationSchema = z.object({
  body: z.object({
    email: z.string().min(1, 'Email es obligatorio'),
    dni: z.string().min(1, 'DNI es obligatorio'),
  }).strip(),
});

/**
 * POST /api/draws/:id/verify-email
 */
const verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().min(1, 'Email es obligatorio'),
    code: z.string().length(6, 'El código debe tener 6 dígitos'),
  }).strip(),
});

/**
 * POST /api/draws/:id/setup-payment
 */
const setupPaymentSchema = z.object({
  body: z.object({
    drawBuyerId: z.union([z.number(), z.string()]).refine(v => !!v, 'El ID del participante es obligatorio'),
  }).strip(),
});

/**
 * POST /api/draws/:id/confirm-payment
 */
const confirmPaymentSchema = z.object({
  body: z.object({
    drawBuyerId: z.union([z.number(), z.string()]).refine(v => !!v, 'El ID del participante es obligatorio'),
    setupIntentId: z.string().min(1, 'setupIntentId es obligatorio'),
    customerId: z.string().optional(),
  }).strip(),
});

/**
 * POST /api/draws/:id/enter
 */
const enterDrawSchema = z.object({
  body: z.object({
    drawBuyerId: z.union([z.number(), z.string()]).refine(v => !!v, 'El ID del participante es obligatorio'),
  }).strip(),
});

/**
 * POST /api/draws/:id/validate-postal-code
 */
const validatePostalCodeSchema = z.object({
  body: z.object({
    postalCode: z.string().min(1, 'Código postal es obligatorio'),
    country: z.string().length(2, 'Código de país debe tener 2 caracteres').default('ES'),
  }).strip(),
});

/**
 * POST /api/admin/draws
 */
const createDrawSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Nombre es obligatorio'),
    description: z.string().optional(),
    product_id: z.union([z.number(), z.string()]).refine(v => !!v, 'El ID del producto es obligatorio'),
    product_type: z.enum(['art', 'other'], { message: 'Tipo de producto inválido' }),
    price: z.union([z.number(), z.string()]).refine(v => !!v, 'El precio es obligatorio'),
    units: z.union([z.number(), z.string()]).optional(),
    min_participants: z.union([z.number(), z.string()]).optional(),
    max_participations: z.union([z.number(), z.string()]).refine(v => !!v, 'El máximo de participaciones es obligatorio'),
    start_datetime: z.string().min(1, 'Fecha de inicio es obligatoria'),
    end_datetime: z.string().min(1, 'Fecha de fin es obligatoria'),
    status: z.string().optional(),
  }).strip(),
});

/**
 * PUT /api/admin/draws/:id
 */
const updateDrawSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    product_id: z.union([z.number(), z.string()]).optional(),
    product_type: z.enum(['art', 'other']).optional(),
    price: z.union([z.number(), z.string()]).optional(),
    units: z.union([z.number(), z.string()]).optional(),
    min_participants: z.union([z.number(), z.string()]).optional(),
    max_participations: z.union([z.number(), z.string()]).optional(),
    start_datetime: z.string().optional(),
    end_datetime: z.string().optional(),
    status: z.string().optional(),
  }).strip(),
});

/**
 * POST /api/admin/draws/:id/participations/:participationId/bill
 */
const billParticipationSchema = z.object({
  body: z.object({
    shippingCost: z.number().min(0, 'El coste de envío debe ser >= 0').default(0),
  }).strip(),
});

module.exports = {
  registerBuyerSchema,
  sendVerificationSchema,
  verifyEmailSchema,
  setupPaymentSchema,
  confirmPaymentSchema,
  enterDrawSchema,
  validatePostalCodeSchema,
  createDrawSchema,
  updateDrawSchema,
  billParticipationSchema,
};
