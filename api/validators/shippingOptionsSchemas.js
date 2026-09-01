const { z } = require('zod');

const shippingOptionsItemSchema = z.object({
  productId: z.union([z.number(), z.string().transform(Number)]),
  productType: z.enum(['art', 'other', 'others']),
  quantity: z.union([z.number(), z.string().transform(Number)]).default(1),
  sellerId: z.union([z.number(), z.string().transform(Number)]),
  sellerName: z.string().optional(),
  weight: z.union([z.number(), z.string().transform(Number)]).optional().nullable(),
  dimensions: z.string().optional().nullable(),
  // `canCopack` is deliberately absent: co-packability decides how many parcels
  // a shipment has, and therefore its price. It is read from `others.can_copack`
  // in `enrichItemsFromDB`, so accepting it here would only leave a field the
  // server ignores but an unauthenticated caller can still try to set.
  name: z.string().optional(),
  price: z.union([z.number(), z.string().transform(Number)]).optional(),
  variantId: z.union([z.number(), z.string().transform(Number)]).optional().nullable(),
});

const deliveryAddressSchema = z.object({
  country: z.string().length(2, 'El código de país debe tener 2 caracteres'),
  postalCode: z.string().min(1, 'El código postal es obligatorio'),
  city: z.string().optional(),
  address: z.string().optional(),
});

/**
 * POST /api/shipping/options
 */
const getShippingOptionsSchema = z.object({
  body: z.object({
    items: z.array(shippingOptionsItemSchema).min(1, 'Se requiere al menos un artículo'),
    deliveryAddress: deliveryAddressSchema,
  }).strip(),
});

/**
 * GET /api/shipping/service-points
 */
const getServicePointsSchema = z.object({
  query: z.object({
    carrier: z.string().min(1, 'El transportista es obligatorio'),
    country: z.string().length(2, 'El código de país debe tener 2 caracteres'),
    postalCode: z.string().min(1, 'El código postal es obligatorio'),
    radius: z.string().transform(Number).optional(),
  }).strip(),
});

module.exports = {
  getShippingOptionsSchema,
  getServicePointsSchema,
};
