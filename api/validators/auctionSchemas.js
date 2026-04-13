const { z } = require('zod');

/**
 * POST /api/auctions/:id/register-buyer
 *
 * Controller checks: firstName, lastName, email are required.
 * Delivery/invoicing address fields are optional.
 */
const registerBuyerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'Nombre es obligatorio'),
    lastName: z.string().min(1, 'Apellido es obligatorio'),
    email: z.string().min(1, 'Email es obligatorio'),
    dni: z.string().min(1, 'DNI/NIE es obligatorio'),
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
 * POST /api/auctions/:id/verify-buyer
 *
 * Controller checks: email and bidPassword are required.
 */
const verifyBuyerSchema = z.object({
  body: z.object({
    email: z.string().min(1, 'Email es obligatorio'),
    bidPassword: z.string().min(1, 'Contraseña de puja es obligatoria'),
  }).strip(),
});

/**
 * POST /api/auctions/:id/bid
 *
 * Controller checks: auctionBuyerId, productId, productType, amount are required.
 * productType must be 'art' or 'other'.
 */
const placeBidSchema = z.object({
  body: z.object({
    auctionBuyerId: z.union([z.number(), z.string()]).refine(v => !!v, 'El ID del comprador es obligatorio'),
    productId: z.union([z.number(), z.string()]).refine(v => !!v, 'El ID del producto es obligatorio'),
    productType: z.enum(['art', 'other'], { message: 'Tipo de producto inválido' }),
    amount: z.union([z.number(), z.string()]).refine(v => !!v, 'El monto es obligatorio'),
    expectedPrice: z.union([z.number(), z.string()]).optional().nullable(),
  }).strip(),
});

/**
 * POST /api/auctions/:id/setup-payment
 *
 * Controller checks: auctionBuyerId is required.
 */
const setupPaymentSchema = z.object({
  body: z.object({
    auctionBuyerId: z.union([z.number(), z.string()]).refine(v => !!v, 'El ID del comprador es obligatorio'),
  }).strip(),
});

/**
 * POST /api/auctions/:id/confirm-payment
 *
 * Controller checks: auctionBuyerId and setupIntentId are required.
 */
const confirmPaymentSchema = z.object({
  body: z.object({
    auctionBuyerId: z.union([z.number(), z.string()]).refine(v => !!v, 'El ID del comprador es obligatorio'),
    setupIntentId: z.string().min(1, 'setupIntentId es obligatorio'),
    customerId: z.string().optional(),
  }).strip(),
});

// Polymorphic postal ref for auction products
const postalRefSchema = z.object({
  ref_type: z.enum(['postal_code', 'province', 'country']).optional(),
  postal_code_id: z.union([z.number(), z.string()]).optional(),
  ref_value: z.string().optional(),
});

// Single product within an auction create/update request
const auctionProductSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  product_id: z.union([z.number(), z.string()]).optional(),
  type: z.string().optional(),
  product_type: z.string().optional(),
  start_price: z.union([z.number(), z.string()]).optional(),
  step_new_bid: z.union([z.number(), z.string()]).optional(),
  position: z.union([z.number(), z.string()]).optional(),
  shipping_observations: z.string().optional().nullable(),
  postal_refs: z.array(postalRefSchema).optional(),
});

/**
 * POST /api/admin/auctions
 *
 * Controller checks: name, start_datetime, end_datetime are required.
 * start_datetime must be before end_datetime (checked at runtime).
 */
const createAuctionSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Nombre es obligatorio'),
    description: z.string().optional(),
    start_datetime: z.string().min(1, 'Fecha de inicio es obligatoria'),
    end_datetime: z.string().min(1, 'Fecha de fin es obligatoria'),
    status: z.string().optional(),
    products: z.array(auctionProductSchema).optional(),
    user_ids: z.array(z.union([z.number(), z.string()])).optional(),
  }).strip(),
});

/**
 * PUT /api/admin/auctions/:id
 *
 * Same fields as create but all optional.
 */
const updateAuctionSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    start_datetime: z.string().optional(),
    end_datetime: z.string().optional(),
    status: z.string().optional(),
    products: z.array(auctionProductSchema).optional(),
    user_ids: z.array(z.union([z.number(), z.string()])).optional(),
  }).strip(),
});

/**
 * POST /api/auctions/:id/send-verification
 *
 * Sends an OTP code to the buyer's email.
 */
const sendVerificationSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido'),
    dni: z.string().min(1, 'DNI/NIE es obligatorio'),
  }).strip(),
});

/**
 * POST /api/auctions/:id/verify-email
 *
 * Verifies the OTP code sent to the buyer's email.
 */
const verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido'),
    code: z.string().length(6, 'El código debe tener 6 dígitos'),
  }).strip(),
});

module.exports = {
  registerBuyerSchema,
  verifyBuyerSchema,
  placeBidSchema,
  setupPaymentSchema,
  confirmPaymentSchema,
  createAuctionSchema,
  updateAuctionSchema,
  sendVerificationSchema,
  verifyEmailSchema,
};
