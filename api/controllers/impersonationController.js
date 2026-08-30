const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const { db } = require('../config/database');
const { sendSuccess } = require('../utils/response');
const { hashIp } = require('../utils/ipPrivacy');
const {
  sqlUtcTimestamp,
  isJwtIssuedBeforePasswordChange,
} = require('../utils/passwordSecurity');

/**
 * Admin impersonation by token exchange (admin-user-impersonation).
 *
 * An admin obtains a JWT whose subject is another user, so that every screen,
 * guard and endpoint behaves exactly as it does for that user — with no
 * password read, written or transmitted anywhere in the flow.
 *
 * The token is an ordinary user token as far as `config/passport.js` is
 * concerned: `req.user` is rebuilt from the target's row like any other
 * request. The only difference is the `act` claim (RFC 8693 Token Exchange),
 * which names the admin and is what the stop endpoint below trusts to hand
 * back an admin session.
 */

/**
 * An impersonation is an intervention, not a session.
 *
 * Deliberately NOT `JWT_EXPIRES_IN`: inheriting the login lifetime would make
 * this a 7-day second account. Same reasoning as the local VAT constant in
 * `services/shipping/artShippingCalculator.js` — two numbers that answer
 * different questions must not be able to move together.
 */
const IMPERSONATION_TTL_MINUTES = 60;

// Machine-readable codes carried in the ApiError `title`, same pattern as
// RESET_ERRORS in authController.js and SHIPPING_ADDRESS_REQUIRED. The es-ES
// copy lives in client/lib/constants.js, so no page has to match Spanish prose.
const IMPERSONATION_ERRORS = {
  TARGET_FORBIDDEN: 'IMPERSONATION_TARGET_FORBIDDEN',
  TARGET_NOT_ACTIVATED: 'IMPERSONATION_TARGET_NOT_ACTIVATED',
  NOT_ACTIVE: 'IMPERSONATION_NOT_ACTIVE',
  ACTOR_INVALID: 'IMPERSONATION_ACTOR_INVALID',
  ACTION_BLOCKED: 'IMPERSONATION_ACTION_BLOCKED',
};

/**
 * POST /api/admin/impersonation/:userId/start
 *
 * Mounted under routes/admin/, so `authenticate` + `adminAuth` have already
 * run: req.user is guaranteed to be an admin here.
 */
const startImpersonation = async (req, res, next) => {
  try {
    const targetId = Number(req.params.userId);
    const admin = req.user;

    const result = await db.execute({
      sql: 'SELECT id, email, role, full_name, password_hash FROM users WHERE id = ?',
      args: [targetId],
    });

    const target = result.rows[0];

    if (!target) {
      throw new ApiError(404, 'Usuario no encontrado', 'No encontrado');
    }

    // No lateral and no upward moves. Covers the admin naming themselves,
    // which is both pointless and the shape a privilege chain would start in.
    if (target.role === 'admin' || target.id === admin.id) {
      throw new ApiError(
        403,
        'No se puede impersonar a un administrador',
        IMPERSONATION_ERRORS.TARGET_FORBIDDEN
      );
    }

    // An account that never activated has no session to reproduce — it belongs
    // to the invitation flow, exactly as in send-password-reset.
    if (!target.password_hash || target.password_hash.length === 0) {
      throw new ApiError(
        400,
        'Este usuario todavía no ha configurado su contraseña, así que no tiene una sesión que reproducir',
        IMPERSONATION_ERRORS.TARGET_NOT_ACTIVATED
      );
    }

    const now = Date.now();
    const expiresAt = sqlUtcTimestamp(new Date(now + IMPERSONATION_TTL_MINUTES * 60 * 1000));

    // The audit row is written BEFORE the token is signed: a row with no token
    // is a harmless orphan, whereas a live token with no audit trail is the one
    // state this feature must never produce.
    const inserted = await db.execute({
      sql: `INSERT INTO impersonation_sessions
              (admin_user_id, target_user_id, expires_at, ip_address)
            VALUES (?, ?, ?, ?)`,
      args: [admin.id, target.id, expiresAt, hashIp(req.ip)],
    });

    const sessionId = Number(inserted.lastInsertRowid);

    const token = jwt.sign(
      {
        // The same three fields authController.login signs, for the TARGET.
        id: target.id,
        email: target.email,
        role: target.role,
        // RFC 8693 actor claim. `iat` is the admin's CURRENT session issue
        // time, carried so the stop endpoint can apply the same
        // password_changed_at rule to the admin that passport applies to
        // everyone else — otherwise resetting an admin's password would end
        // their sessions everywhere except inside an impersonation.
        act: {
          id: admin.id,
          email: admin.email,
          iat: req.tokenIssuedAt ?? Math.floor(now / 1000),
          sid: sessionId,
        },
      },
      process.env.JWT_SECRET,
      { expiresIn: `${IMPERSONATION_TTL_MINUTES}m` }
    );

    logger.info(
      { adminUserId: admin.id, targetUserId: target.id, sessionId },
      'Impersonation started'
    );

    return sendSuccess(res, {
      token,
      // Same shape POST /api/auth/login returns. Note the SELECT above never
      // read password_setup_token or password_reset_token_hash, and
      // password_hash is not carried into the response.
      user: {
        id: target.id,
        email: target.email,
        role: target.role,
        full_name: target.full_name,
      },
      impersonation: {
        sessionId,
        adminName: admin.full_name || admin.email,
        targetName: target.full_name || target.email,
        expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/impersonation/stop
 *
 * Declared on the PUBLIC auth router because it is reached carrying a
 * non-admin token — `adminAuth` would reject it. Its whole authority comes
 * from the signed `act` claim, which the caller cannot forge, plus the
 * re-validation of the actor against the database below.
 */
const stopImpersonation = async (req, res, next) => {
  try {
    const actor = req.impersonator;

    if (!actor) {
      throw new ApiError(
        400,
        'No hay ninguna sesión de impersonation activa',
        IMPERSONATION_ERRORS.NOT_ACTIVE
      );
    }

    const result = await db.execute({
      sql: 'SELECT id, email, role, full_name, password_changed_at FROM users WHERE id = ?',
      args: [actor.id],
    });

    const admin = result.rows[0];

    // Deleted, demoted, or signed out everywhere by a password reset that
    // happened while the impersonation was in flight. None of the three may
    // buy an admin token back.
    if (
      !admin ||
      admin.role !== 'admin' ||
      isJwtIssuedBeforePasswordChange(actor.issuedAt, admin.password_changed_at)
    ) {
      throw new ApiError(
        403,
        'La sesión de administrador ya no es válida. Vuelve a iniciar sesión.',
        IMPERSONATION_ERRORS.ACTOR_INVALID
      );
    }

    // Bounded by admin_user_id as well as by id: a session id lifted from
    // somewhere else cannot close another admin's row. Conditional on
    // ended_at IS NULL so a double stop cannot rewrite the first end time.
    if (actor.sessionId) {
      await db.execute({
        sql: `UPDATE impersonation_sessions
                 SET ended_at = CURRENT_TIMESTAMP, ended_reason = 'manual'
               WHERE id = ? AND admin_user_id = ? AND ended_at IS NULL`,
        args: [actor.sessionId, admin.id],
      });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        // No `act` claim: this is an ordinary admin session again.
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info(
      { adminUserId: admin.id, targetUserId: req.user.id, sessionId: actor.sessionId },
      'Impersonation ended'
    );

    return sendSuccess(res, {
      token,
      user: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        full_name: admin.full_name,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  IMPERSONATION_TTL_MINUTES,
  IMPERSONATION_ERRORS,
  startImpersonation,
  stopImpersonation,
};
