const jwt = require('jsonwebtoken');
const passport = require('passport');
const bcrypt = require('bcrypt');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const validator = require('validator');
const { db } = require('../config/database');

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

    // Update user: set password and clear the token
    await db.execute({
      sql: `UPDATE users
            SET password_hash = ?, password_setup_token = NULL, password_setup_token_expires = NULL
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
  getPasswordRequirements,
  validatePassword,
};
