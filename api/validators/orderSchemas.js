const { z } = require('zod');

// Reusable address shape (all fields optional -- the controller tolerates
// partial / missing addresses and falls back to null for each DB column).
const addressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  lat: z.union([z.number(), z.string()]).optional(),
  lng: z.union([z.number(), z.string()]).optional(),
}).optional();

// Shipping info attached to each item
const itemShippingSchema = z.object({
  methodId: z.union([z.number(), z.string()]).optional(),
  cost: z.number().optional(),
  methodName: z.string().optional(),
  methodType: z.string().optional(),
  methodDescription: z.string().optional(),
}).optional();

// Single order item -- type is 'art' or 'other'.
// `shipping` is required by the controller (it rejects items without it).
const orderItemSchema = z.object({
  type: z.enum(['art', 'other']),
  id: z.union([z.number(), z.string()]),
  variantId: z.union([z.number(), z.string()]).optional(),
  shipping: itemShippingSchema,
});

// Customer block (optional -- used when provided to build Revolut / Stripe objects)
const customerSchema = z.object({
  email: z.string().optional(),
  full_name: z.string().optional(),
  fullName: z.string().optional(),
  phone: z.string().optional(),
}).optional();

/**
 * POST /api/orders/placeOrder
 *
 * The controller requires:
 *  - A valid email (from `email`, `guest_email`, or `customer.email`)
 *  - items: non-empty array
 *  - Every item must have a `shipping` object
 *  - Either revolut_order_id (revolut) or stripe_payment_intent_id (stripe)
 *
 * We keep this schema loose to match the controller's inline checks, which
 * handle provider-specific fields conditionally.
 */
const placeOrderSchema = z.object({
  body: z.object({
    // At least one email source must be present -- the controller coalesces them.
    email: z.string().optional(),
    guest_email: z.string().optional(),
    phone: z.string().optional(),

    items: z.array(orderItemSchema).min(1, 'items debe ser un array no vacío'),

    payment_provider: z.string().optional(),
    revolut_order_id: z.string().optional(),
    revolut_order_token: z.string().optional(),
    stripe_payment_intent_id: z.string().optional(),

    customer: customerSchema,
    delivery_address: addressSchema,
    invoicing_address: addressSchema,

    currency: z.string().optional(),
    description: z.string().optional(),
  }),
});

/**
 * PUT /api/orders (confirmOrderPayment)
 */
const confirmOrderPaymentSchema = z.object({
  body: z.object({
    order_id: z.union([z.number(), z.string()]).refine(v => !!v, 'order_id es obligatorio'),
    payment_id: z.string().min(1, 'payment_id es obligatorio'),
    provider: z.string().optional(),
  }),
});

/**
 * PUT /api/orders/:orderId/items/:itemId/status
 * Controller checks: status (required string), product_type ('art'|'other')
 */
const updateItemStatusSchema = z.object({
  body: z.object({
    status: z.string().min(1, 'Estado inválido'),
    product_type: z.enum(['art', 'other'], { message: 'Tipo de producto inválido' }),
    tracking: z.string().optional(),
  }),
});

/**
 * PUT /api/orders/:orderId/items/:itemId/tracking
 * Controller checks: tracking (non-empty string), product_type ('art'|'other')
 */
const updateItemTrackingSchema = z.object({
  body: z.object({
    tracking: z.string().min(1, 'El número de seguimiento no puede estar vacío'),
    product_type: z.enum(['art', 'other'], { message: 'Tipo de producto inválido' }),
  }),
});

/**
 * PUT /api/orders/:orderId/status
 * Controller checks: status (required string -- currently only 'sent' is allowed)
 */
const updateOrderStatusSchema = z.object({
  body: z.object({
    status: z.string().min(1, 'Estado inválido'),
    tracking: z.string().optional(),
  }),
});

module.exports = {
  placeOrderSchema,
  confirmOrderPaymentSchema,
  updateItemStatusSchema,
  updateItemTrackingSchema,
  updateOrderStatusSchema,
};
