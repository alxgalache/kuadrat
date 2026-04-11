/**
 * Zod schemas for the Stripe Connect fiscal-report admin endpoints
 * (Change #4: stripe-connect-fiscal-report).
 *
 * All endpoints are GETs that take their arguments from `req.query`, so each
 * schema wraps the actual shape in `{ query: ... }` to match the convention
 * used by `middleware/validate.js`.
 */
const { z } = require('zod');

const formatEnum = z.enum(['csv', 'json']);
const vatRegimeEnum = z.enum(['art_rebu', 'standard_vat']);

// YYYY-MM-DD. Refined below against the calendar.
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
  }, 'Fecha inválida');

const MAX_RANGE_DAYS = 366;

function diffDaysInclusive(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((b - a) / (24 * 3600 * 1000)) + 1;
}

/**
 * `GET /api/admin/payouts/:withdrawalId/fiscal-export`
 * The only query parameter is `format` (defaults to csv).
 */
const singlePayoutExportQuerySchema = z.object({
  query: z
    .object({
      format: formatEnum.optional().default('csv'),
    })
    .strip(),
});

/**
 * `GET /api/admin/payouts/fiscal-export`
 * Range export. Enforces `from <= to` and a 366-day cap.
 */
const rangeExportQuerySchema = z.object({
  query: z
    .object({
      from: dateStringSchema,
      to: dateStringSchema,
      format: formatEnum.optional().default('csv'),
      vat_regime: vatRegimeEnum.optional(),
      sellerId: z
        .union([z.string().regex(/^\d+$/), z.number().int().positive()])
        .optional()
        .transform((v) => (v === undefined ? undefined : Number(v))),
    })
    .strip()
    .refine((q) => q.to >= q.from, {
      message: '`to` debe ser mayor o igual que `from`',
      path: ['to'],
    })
    .refine((q) => diffDaysInclusive(q.from, q.to) <= MAX_RANGE_DAYS, {
      message: `El rango no puede exceder ${MAX_RANGE_DAYS} días`,
      path: ['to'],
    }),
});

/**
 * `GET /api/admin/payouts/summary`
 * Same shape as the range export, minus `format` (always JSON).
 */
const summaryQuerySchema = z.object({
  query: z
    .object({
      from: dateStringSchema,
      to: dateStringSchema,
      vat_regime: vatRegimeEnum.optional(),
      sellerId: z
        .union([z.string().regex(/^\d+$/), z.number().int().positive()])
        .optional()
        .transform((v) => (v === undefined ? undefined : Number(v))),
    })
    .strip()
    .refine((q) => q.to >= q.from, {
      message: '`to` debe ser mayor o igual que `from`',
      path: ['to'],
    })
    .refine((q) => diffDaysInclusive(q.from, q.to) <= MAX_RANGE_DAYS, {
      message: `El rango no puede exceder ${MAX_RANGE_DAYS} días`,
      path: ['to'],
    }),
});

module.exports = {
  singlePayoutExportQuerySchema,
  rangeExportQuerySchema,
  summaryQuerySchema,
  MAX_RANGE_DAYS,
};
