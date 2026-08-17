const jwt = require('jsonwebtoken');
const passport = require('passport');
const bcrypt = require('bcrypt');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const validator = require('validator');
const { db } = require('../config/database');
const { hashResetToken } = require('../utils/passwordSecurity');

// Machine-readable codes carried in the ApiError `title`, same pattern as
// SHIPPING_ADDRESS_REQUIRED / CAPTCHA_UNAVAILABLE. The es-ES copy lives in
// client/lib/constants.js, so the page never has to match Spanish prose.
const RESET_ERRORS = {
  INVALID: 'RESET_TOKEN_INVALID',
  EXPIRED: 'RESET_TOKEN_EXPIRED',
  WEAK: 'RESET_PASSWORD_WEAK',
};

// Login user
const login = async (req, res, next) => {
  try {
    // Use passport local strategy to authenticate
    passport.authenticate('local', { session: false }, (err, user, info) => {
      if (err) {
        return next(err);
      }

      if (!user) {
        return next(new ApiError(401, info.message || 'Credenciales inválidas', 'Inicio de sesión fallido'));
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        process.env.JWT_SECRET,
        {
          expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        }
      );

      res.status(200).json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          full_name: user.full_name,
        },
      });
    })(req, res, next);
  } catch (error) {
    next(error);
  }
};

// Registration request (sends email to admin)
const registrationRequest = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      throw new ApiError(400, 'El correo electrónico es obligatorio', 'Error de validación');
    }

    if (!validator.isEmail(email)) {
      throw new ApiError(400, 'Formato de correo electrónico inválido', 'Error de validación');
    }

    // Send registration request email to admin
    const { sendRegistrationRequest } = require('../services/emailService');

    try {
      await sendRegistrationRequest(email);
    } catch (emailError) {
      logger.error({ err: emailError }, 'Failed to send registration request email');
      throw new ApiError(500, 'Error al enviar la solicitud. Por favor, inténtalo de nuevo.', 'Error del servidor');
    }

    res.status(200).json({
      success: true,
      message: 'Solicitud de registro enviada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// Password validation requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = {
  minLength: PASSWORD_MIN_LENGTH,
  hasUppercase: true,
  hasLowercase: true,
  hasNumber: true,
};

/**
 * Validate password against requirements
 */
function validatePassword(password) {
  const errors = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra mayúscula');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra minúscula');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('La contraseña debe contener al menos un número');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Validate password setup token
const validateSetupToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      throw new ApiError(400, 'Token no proporcionado', 'Error de validación');
    }

    // Find user with this token
    const result = await db.execute({
      sql: `SELECT id, email, full_name, password_hash, password_setup_token_expires
            FROM users
            WHERE password_setup_token = ?`,
      args: [token],
    });

    if (result.rows.length === 0) {
      throw new ApiError(404, 'El enlace de configuración no es válido o ya ha sido utilizado', 'Enlace inválido');
    }

    const user = result.rows[0];

    // Check if token has expired
    const expiresAt = new Date(user.password_setup_token_expires);
    if (Date.now() > expiresAt.getTime()) {
      throw new ApiError(410, 'El enlace de configuración ha expirado. Contacta con el administrador para recibir un nuevo enlace.', 'Enlace expirado');
    }

    // Check if password is already set
    if (user.password_hash && user.password_hash.length > 0) {
      throw new ApiError(400, 'La contraseña ya ha sido configurada para esta cuenta', 'Cuenta ya configurada');
    }

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Set password using setup token
const setPassword = async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token) {
      throw new ApiError(400, 'Token no proporcionado', 'Error de validación');
    }

    if (!password || !confirmPassword) {
      throw new ApiError(400, 'La contraseña y su confirmación son obligatorias', 'Error de validación');
    }

    if (password !== confirmPassword) {
      throw new ApiError(400, 'Las contraseñas no coinciden', 'Error de validación');
    }

    // Validate password requirements
    const validation = validatePassword(password);
    if (!validation.isValid) {
      throw new ApiError(400, validation.errors.join('. '), 'Contraseña insegura');
    }

    // Find user with this token
    const result = await db.execute({
      sql: `SELECT id, email, full_name, password_hash, password_setup_token_expires
            FROM users
            WHERE password_setup_token = ?`,
      args: [token],
    });

    if (result.rows.length === 0) {
      throw new ApiError(404, 'El enlace de configuración no es válido o ya ha sido utilizado', 'Enlace inválido');
    }

    const user = result.rows[0];

    // Check if token has expired
    const expiresAt = new Date(user.password_setup_token_expires);
    if (Date.now() > expiresAt.getTime()) {
      throw new ApiError(410, 'El enlace de configuración ha expirado. Contacta con el administrador para recibir un nuevo enlace.', 'Enlace expirado');
    }

    // Check if password is already set
    if (user.password_hash && user.password_hash.length > 0) {
      throw new ApiError(400, 'La contraseña ya ha sido configurada para esta cuenta', 'Cuenta ya configurada');
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user: set password and clear the token. password_changed_at is
    // stamped for consistency with every other password write — no session
    // can predate it here, since the account had no password until now.
    await db.execute({
      sql: `UPDATE users
            SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP,
                password_setup_token = NULL, password_setup_token_expires = NULL
            WHERE id = ?`,
      args: [hashedPassword, user.id],
    });

    // Send account activated email (non-blocking)
    const { sendAccountActivatedEmail } = require('../services/emailService');
    sendAccountActivatedEmail({ email: user.email, fullName: user.full_name })
      .catch((err) => logger.warn({ err }, 'Failed to send account activated email'));

    // Generate JWT token so user can login immediately
    const jwtToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: 'seller',
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      }
    );

    res.status(200).json({
      success: true,
      message: 'Contraseña configurada correctamente',
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        role: 'seller',
        full_name: user.full_name,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Admin-initiated password reset
//
// Separate from the activation flow above on purpose: that one only ever opens
// an account whose password_hash is still empty, and relaxing it would let a
// leaked invitation reopen a live account. These two endpoints work the other
// way round — they exist precisely for accounts that already have a password.
// ---------------------------------------------------------------------------

/**
 * Look a reset token up, distinguishing "never existed / already used" from
 * "existed but expired".
 *
 * Expiry is evaluated inside SQLite rather than in JavaScript: the stored
 * value is written in the same zone-less UTC shape CURRENT_TIMESTAMP produces,
 * and parsing it with Node's Date would read it as local time. The cost is
 * that a miss cannot tell the two cases apart, so the second query runs only
 * when the first finds nothing — the distinction matters to the artist, who
 * needs to know whether to ask the admin for a new link.
 *
 * @returns {Promise<{user?: object, expired?: boolean}>}
 */
async function findUserByResetToken(token) {
  const tokenHash = hashResetToken(token);

  const live = await db.execute({
    sql: `SELECT id, email, full_name
          FROM users
          WHERE password_reset_token_hash = ?
            AND password_reset_token_expires IS NOT NULL
            AND datetime(password_reset_token_expires) > datetime('now')`,
    args: [tokenHash],
  });

  if (live.rows.length > 0) return { user: live.rows[0] };

  const stale = await db.execute({
    sql: 'SELECT id FROM users WHERE password_reset_token_hash = ?',
    args: [tokenHash],
  });

  return stale.rows.length > 0 ? { expired: true } : {};
}

// Validate a password reset token — GET /api/auth/validate-reset-token/:token
const validateResetToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      throw new ApiError(400, 'Token no proporcionado', RESET_ERRORS.INVALID);
    }

    const { user, expired } = await findUserByResetToken(token);

    if (expired) {
      throw new ApiError(
        410,
        'El enlace ha expirado. Pide al administrador que te envíe uno nuevo.',
        RESET_ERRORS.EXPIRED
      );
    }

    if (!user) {
      throw new ApiError(
        404,
        'El enlace no es válido o ya ha sido utilizado',
        RESET_ERRORS.INVALID
      );
    }

    // Only the name travels back. Returning the email would turn a stolen
    // link into confirmation of which account it opens.
    res.status(200).json({
      success: true,
      user: { full_name: user.full_name },
    });
  } catch (error) {
    next(error);
  }
};

// Consume a password reset token — POST /api/auth/reset-password
const resetPassword = async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token) {
      throw new ApiError(400, 'Token no proporcionado', RESET_ERRORS.INVALID);
    }

    if (!password || !confirmPassword) {
      throw new ApiError(400, 'La contraseña y su confirmación son obligatorias', 'Error de validación');
    }

    if (password !== confirmPassword) {
      throw new ApiError(400, 'Las contraseñas no coinciden', 'Error de validación');
    }

    const validation = validatePassword(password);
    if (!validation.isValid) {
      throw new ApiError(400, validation.errors.join('. '), RESET_ERRORS.WEAK);
    }

    const { user, expired } = await findUserByResetToken(token);

    if (expired) {
      throw new ApiError(
        410,
        'El enlace ha expirado. Pide al administrador que te envíe uno nuevo.',
        RESET_ERRORS.EXPIRED
      );
    }

    if (!user) {
      throw new ApiError(
        404,
        'El enlace no es válido o ya ha sido utilizado',
        RESET_ERRORS.INVALID
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // One conditional statement: sets the password, stamps the session
    // cut-off and burns the token together. Still guarded by the token hash,
    // so two requests carrying the same link cannot both set a password —
    // the loser sees rowsAffected = 0 and gets a 404, not a 500.
    const updated = await db.execute({
      sql: `UPDATE users
            SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP,
                password_reset_token_hash = NULL, password_reset_token_expires = NULL
            WHERE id = ? AND password_reset_token_hash = ?`,
      args: [hashedPassword, user.id, hashResetToken(token)],
    });

    if (updated.rowsAffected === 0) {
      throw new ApiError(
        404,
        'El enlace no es válido o ya ha sido utilizado',
        RESET_ERRORS.INVALID
      );
    }

    logger.info({ userId: user.id }, 'Password reset completed');

    const { sendPasswordChangedEmail } = require('../services/emailService');
    sendPasswordChangedEmail({ email: user.email, fullName: user.full_name })
      .catch((err) => logger.warn({ err }, 'Failed to send password changed email'));

    // Deliberately no JWT: unlike the activation flow, the account already
    // exists and may be in dispute, so mailbox access must not be enough to
    // hand out a session. The artist signs in with the new password.
    res.status(200).json({
      success: true,
      message: 'Contraseña actualizada correctamente',
    });
  } catch (error) {
    next(error);
  }
};

// Get password requirements (for frontend validation)
const getPasswordRequirements = async (req, res) => {
  res.status(200).json({
    success: true,
    requirements: PASSWORD_REQUIREMENTS,
  });
};

module.exports = {
  login,
  registrationRequest,
  validateSetupToken,
  setPassword,
  validateResetToken,
  resetPassword,
  getPasswordRequirements,
  validatePassword,
};
