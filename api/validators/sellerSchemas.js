const { z } = require('zod');

/**
 * PUT /api/seller/profile/password
 */
const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'La contraseña actual es obligatoria'),
    newPassword: z.string().min(1, 'La nueva contraseña es obligatoria'),
    confirmPassword: z.string().min(1, 'La confirmación de contraseña es obligatoria'),
  }).strip(),
});

module.exports = {
  changePasswordSchema,
};
