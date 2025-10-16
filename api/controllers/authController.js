const jwt = require('jsonwebtoken');
const passport = require('passport');
const { ApiError } = require('../middleware/errorHandler');
const validator = require('validator');

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
      console.error('Failed to send registration request email:', emailError);
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

module.exports = {
  login,
  registrationRequest,
};
