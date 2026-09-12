const passport = require('passport');
const { ApiError } = require('./errorHandler');
const { canPublishProducts } = require('../utils/sellerCapabilities');

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

/**
 * Middleware to check the seller may publish and manage products
 * (seller-kind-artist-speaker).
 *
 * A seller with `seller_kind = 'speaker'` only takes part in multimedia
 * events: they have no artwork, no store product and no shipment. Every route
 * that creates, lists, edits or ships one is closed to them here.
 *
 * It is a named, exported middleware rather than an `if` inside each
 * controller for the same reason `blockWhileImpersonating` is: protecting one
 * more endpoint is a line, not a copied condition that can drift from this
 * one. And the answer has to live on the server — hiding a menu entry on the
 * client is not a permission, it only avoids offering what cannot be done.
 *
 * Assumes `authenticate` + `requireSeller` ran first; it re-checks the role
 * anyway so mounting it alone cannot silently pass a buyer through.
 */
const requireArtistSeller = (req, res, next) => {
  if (!req.user) {
    throw new ApiError(401, 'Autenticación requerida');
  }

  if (req.user.role !== 'seller') {
    throw new ApiError(403, 'Acceso denegado. Se requiere rol de vendedor.');
  }

  if (!canPublishProducts(req.user)) {
    throw new ApiError(
      403,
      'Esta sección no está disponible para un usuario de tipo Ponente.',
      'SELLER_KIND_FORBIDDEN'
    );
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
  requireArtistSeller,
  requireBuyer,
  requireAuth,
  blockWhileImpersonating,
};
