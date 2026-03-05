const { z } = require('zod');

/**
 * POST /api/admin/shipping/methods
 *
 * Controller requires: name, type ('delivery' | 'pickup').
 * article_type defaults to 'all'.
 * max_dimensions validated as "NxNxN" pattern when present.
 */
const createMethodSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'El nombre es obligatorio'),
    type: z.enum(['delivery', 'pickup'], { message: 'Tipo debe ser "delivery" o "pickup"' }),
    description: z.string().optional(),
    article_type: z.enum(['art', 'others', 'all']).optional(),
    max_weight: z.union([z.number(), z.string()]).optional(),
    max_dimensions: z
      .string()
      .regex(
        /^\d+x\d+x\d+$/,
        'Dimensiones máximas deben estar en formato "AnchoxLargoxAlto" (e.g., "100x80x60")'
      )
      .optional(),
    max_articles: z.union([z.number(), z.string()]).optional(),
    estimated_delivery_days: z.union([z.number(), z.string()]).optional(),
    is_active: z.union([z.number(), z.boolean()]).optional(),
  }).strip(),
});

/**
 * PUT /api/admin/shipping/methods/:id
 *
 * Same fields as create but all optional (COALESCE update).
 */
const updateMethodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    type: z.enum(['delivery', 'pickup']).optional(),
    article_type: z.enum(['art', 'others', 'all']).optional(),
    max_weight: z.union([z.number(), z.string()]).optional().nullable(),
    max_dimensions: z
      .string()
      .regex(
        /^\d+x\d+x\d+$/,
        'Dimensiones máximas deben estar en formato "AnchoxLargoxAlto" (e.g., "100x80x60")'
      )
      .optional()
      .nullable(),
    max_articles: z.union([z.number(), z.string()]).optional(),
    estimated_delivery_days: z.union([z.number(), z.string()]).optional().nullable(),
    is_active: z.union([z.number(), z.boolean()]).optional(),
  }).strip(),
});

// Polymorphic postal ref
const postalRefSchema = z.object({
  ref_type: z.enum(['postal_code', 'province', 'country']).optional(),
  postal_code_id: z.union([z.number(), z.string()]).optional(),
  id: z.union([z.number(), z.string()]).optional(),
  ref_value: z.string().optional(),
});

/**
 * POST /api/admin/shipping/methods/:methodId/zones
 *
 * Controller requires: seller_id, cost.
 * country is required for 'delivery' methods but that is checked at runtime
 * against the method type, so we keep it optional here.
 */
const createZoneSchema = z.object({
  body: z.object({
    seller_id: z.union([z.number(), z.string()]).refine(v => !!v, 'Vendedor es obligatorio'),
    cost: z.union([z.number(), z.string()]),
    country: z.string().optional(),
    postal_refs: z.array(postalRefSchema).optional(),
  }).strip(),
});

/**
 * PUT /api/admin/shipping/zones/:zoneId
 *
 * All fields optional (dynamic update).
 */
const updateZoneSchema = z.object({
  body: z.object({
    seller_id: z.union([z.number(), z.string()]).optional(),
    cost: z.union([z.number(), z.string()]).optional(),
    country: z.string().optional(),
    postal_refs: z.array(postalRefSchema).optional(),
  }).strip(),
});

/**
 * POST /api/admin/postal-codes/by-refs
 *
 * Body: { refs: [{ ref_type, postal_code_id?, ref_value?, country? }] }
 * Controller returns early with empty array when refs is empty/missing.
 */
const addPostalCodesSchema = z.object({
  body: z.object({
    refs: z.array(postalRefSchema),
  }).strip(),
});

module.exports = {
  createMethodSchema,
  updateMethodSchema,
  createZoneSchema,
  updateZoneSchema,
  addPostalCodesSchema,
};
