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

// The buyer's Sendcloud choice, one entry per seller. It arrives as its own
// field because it never lands on the cart item: `setSendcloudShipping` writes
// to `shippingSelections`, a state parallel to the cart, and `item.shipping`
// stays null — which is why the shipping used to be quoted and then never
// charged. `cost` is what the buyer was shown; the server re-quotes and charges
// its own number, and uses this one only to notice that the rate has moved.
const sendcloudSelectionSchema = z
  .object({
    sellerId: z.union([z.number().int().positive(), z.string().transform(Number)]),
    shippingOptionCode: z.string().optional(),
    servicePointId: z.union([z.number(), z.string()]).nullable().optional(),
    cost: z.number().nonnegative({ message: 'Coste de envío inválido' }).optional(),
    type: z.string().optional(),
  })
  .passthrough();

const initPaymentSchema = z.object({
  body: z.object({
    items: z
      .array(compactItemSchema)
      .min(1, { message: 'items debe ser un array no vacío' }),
    currency: z.string().trim().min(3).max(3).optional(),
    deliveryAddress: deliveryAddressSchema,
    shippingSelections: z.array(sendcloudSelectionSchema).optional(),
  }).passthrough(),
});

module.exports = { initPaymentSchema, sendcloudSelectionSchema };
