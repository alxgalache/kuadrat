const { z } = require('zod');
const { SELLER_KINDS } = require('../utils/sellerCapabilities');

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

// Seller kind (seller-kind-artist-speaker). This is where the enum is really
// enforced: the column carries its CHECK only in the CREATE TABLE, because
// SQLite would not apply a constraint added by ALTER TABLE to the rows already
// written. Optional on both routes — omitting it means "leave it alone" on
// update and "artist" on create.
// `error` and not `errorMap`: this project is on Zod 4, where the v3
// `errorMap` key is ignored and the message would silently fall back to the
// English default ('Invalid option: expected one of "artist"|"speaker"').
const sellerKind = z.enum(SELLER_KINDS, {
  error: () => 'El tipo de usuario debe ser «Artista» o «Ponente»',
});

/**
 * POST /api/admin/authors
 * Validates only `seller_kind`; the other create fields keep their existing
 * hand-rolled checks in the route. The validate() middleware does not mutate
 * the body, so unrelated fields pass through untouched.
 */
const createAuthorSchema = z.object({
  body: z.object({
    seller_kind: sellerKind.optional(),
  }),
});

/**
 * PUT /api/admin/authors/:id
 * Validates only the commission, VAT and seller-kind fields; other author
 * fields keep their existing (un-Zod-validated) handling. The validate()
 * middleware does not mutate the body, so unrelated fields pass through
 * untouched.
 */
const updateAuthorSchema = z.object({
  body: z.object({
    dealer_commission_art: commissionPercent.optional(),
    dealer_commission_other: commissionPercent.optional(),
    tax_vat_art: vatPercent.optional(),
    tax_vat_other: vatPercent.optional(),
    seller_kind: sellerKind.optional(),
  }),
});

module.exports = {
  createAuthorSchema,
  updateAuthorSchema,
};
