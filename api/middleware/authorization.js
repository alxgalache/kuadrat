const passport = require('passport');
const { ApiError } = require('./errorHandler');

// Middleware to authenticate user using JWT
const authenticate = passport.authenticate('jwt', { session: false });

// Middleware to check if user is a seller
const requireSeller = (req, res, next) => {
  if (!req.user) {
    throw new ApiError(401, 'Autenticación requerida');
  }

  if (req.user.role !== 'seller') {
    throw new ApiError(403, 'Acceso denegado. Se requiere rol de vendedor.');
  }

  next();
};

// Middleware to check if user is a buyer
const requireBuyer = (req, res, next) => {
  if (!req.user) {
    throw new ApiError(401, 'Autenticación requerida');
  }

  if (req.user.role !== 'buyer' && req.user.role !== 'seller') {
    throw new ApiError(403, 'Acceso denegado. Se requiere rol de comprador.');
  }

  next();
};

// Middleware to check if user is authenticated (any role)
const requireAuth = (req, res, next) => {
  if (!req.user) {
    throw new ApiError(401, 'Autenticación requerida');
  }

  next();
};

module.exports = {
  authenticate,
  requireSeller,
  requireBuyer,
  requireAuth,
};
