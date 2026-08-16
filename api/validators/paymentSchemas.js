const { z } = require('zod');

/**
 * Validation for the payment initialisation endpoints.
 *
 * `POST /payments/stripe/create-intent` and `POST /payments/revolut/init-order`
 * had no schema at all: they read `req.body` directly and relied on the
 * controller's own guards. They now carry the buyer's delivery address, which
 * decides which shipping zone prices the order, so the shape is worth stating.
 *
 * Item fields are deliberately permissive (`passthrough`) — the cart sends a
 * richer object than the server reads (method names, estimated days, pickup
 * details), and rejecting the extras would break checkout for no gain. What
 * matters is that the fields the server DOES read have the right type.
 */

// The cart item's shipping selection. `null` is legitimate and load-bearing:
// items quoted live against Sendcloud reach payment with no method chosen yet,
// and are priced by their own flow rather than by legacy zones.
const shippingSelectionSchema = z
  .object({
    methodId: z.union([z.number(), z.string()]).optional(),
    cost: z.number().nonnegative({ message: 'Coste de envío inválido' }).optional(),
    methodType: z.string().optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const compactItemSchema = z
  .object({
    type: z.enum(['art', 'other'], { message: 'Tipo de producto inválido' }),
    id: z.number().int().positive({ message: 'Id de producto inválido' }),
    variantId: z.number().int().positive().nullable().optional(),
    quantity: z.number().int().positive().max(100).optional(),
    shipping: shippingSelectionSchema,
  })
  .passthrough();

// Only what the zone resolver needs. The full address is collected later, by
// `placeOrder`; here the country and postal code are what select the zone.
const deliveryAddressSchema = z
  .object({
    country: z.string().trim().min(2).max(2).optional(),
    postalCode: z.string().trim().min(1).max(16).optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const initPaymentSchema = z.object({
  body: z.object({
    items: z
      .array(compactItemSchema)
      .min(1, { message: 'items debe ser un array no vacío' }),
    currency: z.string().trim().min(3).max(3).optional(),
    deliveryAddress: deliveryAddressSchema,
  }).passthrough(),
});

module.exports = { initPaymentSchema };
