const { z } = require('zod');

const createWithdrawalSchema = z.object({
  body: z.object({
    iban: z.string().min(1, 'El IBAN es obligatorio'),
    recipientName: z.string().optional(),
    saveDetails: z.boolean().optional(),
  }).strip(),
});

module.exports = {
  createWithdrawalSchema,
};
