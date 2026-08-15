const { z } = require('zod');
const { ZONE_GROUPS } = require('../utils/spainShippingZones');

/**
 * Request schemas for the art shipping calculator admin endpoints.
 */

// `LxWxH` in centimetres — the same shape `art.dimensions` uses, validated the
// same way, because the two columns are the same kind of magnitude measured on
// different objects (the package and the artwork).
const dimensionsPattern = /^\d+x\d+x\d+$/;

const artIdParam = z
  .union([z.string().regex(/^\d+$/), z.number().int().positive()])
  .transform((v) => Number(v));

const integerQueryParam = z
  .union([z.string().regex(/^\d+$/), z.number().int().positive()])
  .optional()
  .transform((v) => (v === undefined ? undefined : Number(v)));

// Numeric field arriving from a JSON body — accept the number or its decimal
// string form, since a form input hands over a string.
const decimal = z.union([
  z.number(),
  z.string().regex(/^-?\d+(\.\d+)?$/).transform((v) => Number(v)),
]);

const integer = z.union([
  z.number().int(),
  z.string().regex(/^\d+$/).transform((v) => Number(v)),
]);

const outsideDimensions = z
  .string()
  .regex(dimensionsPattern, 'Las dimensiones externas deben tener el formato LxAxH, por ejemplo 70x70x8');

const outsideWeight = integer.refine((v) => v > 0, 'El peso externo debe ser un número entero de gramos mayor que cero');

const packagingCost = decimal.refine((v) => v >= 0, 'El coste de embalaje no puede ser negativo');

// GET /api/admin/art-shipping/products
const artShippingListQuerySchema = z.object({
  query: z
    .object({
      title: z.string().max(200).optional(),
      author: z.string().max(200).optional(),
      page: integerQueryParam,
      limit: integerQueryParam,
    })
    .strip(),
});

// PATCH /api/admin/art-shipping/:artId/packaging
// Saving the package data without quoting: every field optional, but at least
// one present, so an empty body is a mistake rather than a silent no-op.
const artShippingPackagingSchema = z.object({
  params: z.object({ artId: artIdParam }),
  body: z
    .object({
      outside_dimensions: outsideDimensions.nullable().optional(),
      outside_weight: outsideWeight.nullable().optional(),
      packaging_cost: packagingCost.optional(),
    })
    .strip()
    .refine(
      (body) => Object.keys(body).length > 0,
      'No se ha enviado ningún campo de embalaje'
    ),
});

// POST /api/admin/art-shipping/:artId/quote
// Dimensions and weight are MANDATORY here, unlike in the endpoint above: there
// is no silent fallback to the artwork's own measurements, because the carrier
// bills the volumetric weight of the box and a plausible substitute would
// freeze a wrong price into shipping_zones.cost with nothing to show for it.
const artShippingQuoteSchema = z.object({
  params: z.object({ artId: artIdParam }),
  body: z
    .object({
      outside_dimensions: outsideDimensions,
      outside_weight: outsideWeight,
      packaging_cost: packagingCost.optional(),
    })
    .strip(),
});

// POST /api/admin/art-shipping/:artId/zones
// `selections` carries the priced options the screen is showing, not bare
// codes: the saved zone must hold exactly the price the admin was looking at.
// Re-quoting server-side could return a different rate and would break the one
// guarantee the calculator makes, that the cart shows what the screen showed.
// An empty array is valid and means "this territory has no generated option".
const artShippingZonesSchema = z.object({
  params: z.object({ artId: artIdParam }),
  body: z
    .object({
      zone_group: z.enum(ZONE_GROUPS),
      selections: z.array(
        z
          .object({
            option_code: z.string().min(1).max(120),
            name: z.string().max(200).optional().nullable(),
            carrier_code: z.string().max(120).optional().nullable(),
            base_cost: decimal.refine((v) => v > 0, 'La tarifa debe ser mayor que cero'),
            estimated_days: z
              .union([z.number().int(), z.string().regex(/^\d+$/).transform((v) => Number(v))])
              .optional()
              .nullable(),
          })
          .strip()
      ),
    })
    .strip(),
});

module.exports = {
  artShippingListQuerySchema,
  artShippingPackagingSchema,
  artShippingQuoteSchema,
  artShippingZonesSchema,
  dimensionsPattern,
};
