const { z } = require('zod');

/**
 * POST /api/admin/marketing/announce-author
 * Triggers the "new author" marketing broadcast for a given author.
 */
const announceAuthorSchema = z.object({
  body: z.object({
    authorId: z.coerce.number().int().positive('authorId inválido'),
  }).strip(),
});

module.exports = { announceAuthorSchema };
