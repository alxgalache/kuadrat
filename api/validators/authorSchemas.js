const { z } = require('zod');

// Gallery commission for a seller, expressed as a whole percentage in [0, 100].
// Coerced so the value is accepted whether the client sends a number or a
// numeric string. Optional on update: omitting it leaves the column unchanged.
const commissionPercent = z.coerce
  .number({ invalid_type_error: 'La comisión debe ser un número' })
  .min(0, 'La comisión no puede ser negativa')
  .max(100, 'La comisión no puede superar el 100%');

// Per-seller VAT rate, expressed as a whole percentage in [0, 100]. Same
// coercion/range convention as commissionPercent. Optional on update.
const vatPercent = z.coerce
  .number({ invalid_type_error: 'El IVA debe ser un número' })
  .min(0, 'El IVA no puede ser negativo')
  .max(100, 'El IVA no puede superar el 100%');

/**
 * PUT /api/admin/authors/:id
 * Validates only the commission and VAT fields; other author fields keep their
 * existing (un-Zod-validated) handling. The validate() middleware does not
 * mutate the body, so unrelated fields pass through untouched.
 */
const updateAuthorSchema = z.object({
  body: z.object({
    dealer_commission_art: commissionPercent.optional(),
    dealer_commission_other: commissionPercent.optional(),
    tax_vat_art: vatPercent.optional(),
    tax_vat_other: vatPercent.optional(),
  }),
});

module.exports = {
  updateAuthorSchema,
};
