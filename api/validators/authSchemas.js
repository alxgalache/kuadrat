const { z } = require('zod');

/**
 * POST /api/auth/login
 * Passport handles the actual authentication, but we validate that
 * email and password are present strings.
 */
const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Formato de correo electrónico inválido'),
    password: z.string().min(1, 'La contraseña es obligatoria'),
  }).strip(),
});

/**
 * POST /api/auth/register
 * Registration request -- only email is required by the controller.
 */
const registrationRequestSchema = z.object({
  body: z.object({
    email: z.string().email('Formato de correo electrónico inválido'),
  }).strip(),
});

/**
 * POST /api/auth/set-password
 * Token + password + confirmPassword are validated inline by the controller.
 */
const setPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token no proporcionado'),
    password: z.string().min(1, 'La contraseña es obligatoria'),
    confirmPassword: z.string().min(1, 'La confirmación de contraseña es obligatoria'),
  }).strip(),
});

/**
 * GET /api/auth/validate-token/:token
 * The controller checks `req.params.token`.
 */
const validateSetupTokenSchema = z.object({
  params: z.object({
    token: z.string().min(1, 'Token no proporcionado'),
  }),
});

module.exports = {
  loginSchema,
  registrationRequestSchema,
  setPasswordSchema,
  validateSetupTokenSchema,
};
