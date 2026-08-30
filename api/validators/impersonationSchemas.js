const { z } = require('zod');

/**
 * Admin impersonation (admin-user-impersonation).
 *
 * Params-only: the endpoint takes no body, and everything it needs to decide
 * comes from the authenticated admin plus the target row it loads itself.
 * Nothing about the session — not its lifetime, not the actor, not the
 * audit row — is client-supplied, on purpose: the same reasoning that keeps
 * `zoneId` travelling out of the shipping resolver and never in.
 */
const userIdParam = z
  .union([z.string().regex(/^\d+$/, 'Identificador de usuario inválido'), z.number().int().positive()])
  .transform((v) => Number(v));

// POST /api/admin/impersonation/:userId/start
const startImpersonationSchema = z.object({
  params: z.object({ userId: userIdParam }),
});

module.exports = {
  startImpersonationSchema,
};
