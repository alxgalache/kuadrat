const { z } = require('zod');

// 7-byte UID hex (14 chars), used to identify a tag in the URL params.
const uidParamSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{14}$/, 'UID inválido: debe ser 14 caracteres hexadecimales');

// Public verification endpoint — query params come directly from the chip's
// SUN URL mirror. piccHex is 32 chars (16 bytes ciphertext), cmacHex is 16
// chars (8 bytes truncated CMAC).
const coaVerifyQuerySchema = z.object({
  query: z
    .object({
      picc: z
        .string()
        .regex(/^[0-9a-fA-F]{32}$/, 'picc inválido: debe ser 32 caracteres hex'),
      cmac: z
        .string()
        .regex(/^[0-9a-fA-F]{16}$/, 'cmac inválido: debe ser 16 caracteres hex'),
    })
    .strip(),
});

// Status enum used both by the DB CHECK constraint and the admin endpoints.
const tagStatusEnum = z.enum(['active', 'revoked', 'lost', 'damaged']);

// Integer coming from a URL query string — accept either a numeric string of
// digits or a positive integer. Returns undefined when absent so that the
// controller can apply its own default.
const integerQueryParam = z
  .union([z.string().regex(/^\d+$/), z.number().int().positive()])
  .optional()
  .transform((v) => (v === undefined ? undefined : Number(v)));

// Admin: GET /api/admin/coa/tags
const coaAdminListQuerySchema = z.object({
  query: z
    .object({
      page: integerQueryParam,
      limit: integerQueryParam,
      status: tagStatusEnum.optional(),
      art_id: integerQueryParam,
    })
    .strip(),
});

// Admin: GET /api/admin/coa/tags/:uid
const coaAdminDetailSchema = z.object({
  params: z.object({ uid: uidParamSchema }),
  query: z
    .object({
      events_limit: integerQueryParam,
    })
    .strip(),
});

// Admin: PATCH /api/admin/coa/tags/:uid/status
const coaAdminStatusBodySchema = z.object({
  params: z.object({ uid: uidParamSchema }),
  body: z
    .object({
      status: tagStatusEnum,
      notes: z.string().max(500).optional(),
    })
    .strip(),
});

module.exports = {
  coaVerifyQuerySchema,
  coaAdminListQuerySchema,
  coaAdminDetailSchema,
  coaAdminStatusBodySchema,
};
