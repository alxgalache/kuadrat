const passport = require('passport');
const { ApiError } = require('./errorHandler');

// Middleware to authenticate user using JWT
const authenticate = passport.authenticate('jwt', { session: false });

// Middleware for optional authentication (doesn't fail if no token provided)
const optionalAuthenticate = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (user) {
      req.user = user;
    }
    // Continue regardless of authentication status
    next();
  })(req, res, next);
};

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

/**
 * Refuse an action that must never be taken on someone's behalf
 * (admin-user-impersonation).
 *
 * Applied to exactly ONE route today — `PUT /api/seller/profile/password` —
 * and it is blocked there for two independent reasons, either of which would
 * be sufficient on its own:
 *
 *   1. It would set a password the artist does not know, handing the admin
 *      permanent, unaudited access to the account. That is precisely what
 *      impersonation exists to make unnecessary.
 *   2. It writes `password_changed_at`, which `config/passport.js` compares
 *      against the token's `iat`. The impersonation token would be invalidated
 *      by its own request, and the admin's very next call would 401 into a
 *      full logout.
 *
 * It is a named, exported middleware rather than an `if` inside the route so
 * that blocking a second endpoint later is one line, not a copied condition
 * that can drift from this one.
 */
const blockWhileImpersonating = (req, res, next) => {
  if (req.impersonator) {
    throw new ApiError(
      403,
      'Esta acción no está disponible mientras se impersona a otro usuario',
      'IMPERSONATION_ACTION_BLOCKED'
    );
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireSeller,
  requireBuyer,
  requireAuth,
  blockWhileImpersonating,
};
