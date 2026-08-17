const { z } = require('zod');

/**
 * POST /api/auth/reset-password
 *
 * Shape only — the password rules themselves stay in
 * `authController.validatePassword`, which is the single source the profile
 * change, the activation flow and this one all share. Duplicating them here
 * would give two places to keep in step and one of them would drift.
 *
 * The token is checked for length so an empty string never reaches the
 * hash-and-lookup path.
 */
const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'El token es obligatorio'),
    password: z.string().min(1, 'La contraseña es obligatoria'),
    confirmPassword: z.string().min(1, 'La confirmación de contraseña es obligatoria'),
  }).strip(),
});

module.exports = {
  resetPasswordSchema,
};
