const { z } = require('zod');

const createWithdrawalSchema = z.object({
  body: z.object({
    iban: z.string().min(1, 'El IBAN es obligatorio'),
  }),
});

module.exports = {
  createWithdrawalSchema,
};
