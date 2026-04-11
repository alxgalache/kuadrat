/**
 * Fiscal data Zod schemas — Change #1: stripe-connect-accounts
 *
 * Validates the body of PUT /api/admin/sellers/:id/fiscal.
 * Format-only validation — real KYC happens in Stripe during onboarding.
 */
const { z } = require('zod');

// Spanish fiscal identifier regexes.
// DNI: 8 digits + letter (e.g. 00000000T)
// NIE: X/Y/Z + 7 digits + letter (e.g. X1234567L)
// CIF: company letter + 7 digits + digit/letter (e.g. B12345678)
const dniRegex = /^\d{8}[A-Z]$/;
const nieRegex = /^[XYZ]\d{7}[A-Z]$/;
const cifRegex = /^[A-HJNPQRSUVW]\d{7}[0-9A-J]$/;

const taxIdSchema = z.string().refine(
  (val) => dniRegex.test(val) || nieRegex.test(val) || cifRegex.test(val),
  { message: 'tax_id debe ser un DNI, NIE o CIF español válido' }
);

const sellerFiscalDataSchema = z.object({
  tax_status: z.enum(['autonomo', 'sociedad']),
  tax_id: taxIdSchema,
  fiscal_full_name: z.string().min(1).max(200),
  fiscal_address_line1: z.string().min(1).max(200),
  fiscal_address_line2: z.string().max(200).optional().nullable(),
  fiscal_address_city: z.string().min(1).max(100),
  fiscal_address_postal_code: z.string().regex(/^\d{5}$/, 'CP español: 5 dígitos'),
  fiscal_address_province: z.string().min(1).max(100),
  fiscal_address_country: z.string().length(2).default('ES'),
  irpf_retention_rate: z.number().min(0).max(0.5).optional().nullable(),
});

module.exports = {
  sellerFiscalDataSchema,
  taxIdSchema,
  dniRegex,
  nieRegex,
  cifRegex,
};
