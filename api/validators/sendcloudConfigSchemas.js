const { z } = require('zod');

const sendcloudConfigBody = z.object({
  sender_name: z.string().max(200).optional(),
  sender_company_name: z.string().max(200).optional(),
  sender_address_1: z.string().max(200).optional(),
  sender_address_2: z.string().max(200).optional(),
  sender_house_number: z.string().max(20).optional(),
  sender_city: z.string().max(100).optional(),
  sender_postal_code: z.string().max(20).optional(),
  sender_country: z.string().length(2).default('ES').optional(),
  sender_phone: z.string().max(30).optional(),
  sender_email: z.string().email().max(200).optional().or(z.literal('')),
  require_signature: z.union([z.boolean(), z.number()]).optional(),
  fragile_goods: z.union([z.boolean(), z.number()]).optional(),
  insurance_type: z.enum(['none', 'full_value', 'fixed']).optional(),
  insurance_fixed_amount: z.union([z.number(), z.string()]).optional().nullable(),
  first_mile: z.enum(['pickup', 'dropoff', 'pickup_dropoff']).optional(),
  preferred_carriers: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  excluded_carriers: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  default_hs_code: z.string().max(20).optional().nullable(),
  origin_country: z.string().length(2).optional(),
  vat_number: z.string().max(30).optional().nullable(),
  eori_number: z.string().max(30).optional().nullable(),
  self_packs: z.union([z.boolean(), z.number()]).optional(),
}).strip();

/**
 * POST /api/admin/authors/:id/sendcloud-config
 */
const createSendcloudConfigSchema = z.object({
  body: sendcloudConfigBody,
});

/**
 * PUT /api/admin/authors/:id/sendcloud-config
 */
const updateSendcloudConfigSchema = z.object({
  body: sendcloudConfigBody,
});

module.exports = {
  createSendcloudConfigSchema,
  updateSendcloudConfigSchema,
};
