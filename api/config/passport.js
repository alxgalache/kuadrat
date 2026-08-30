const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const bcrypt = require('bcrypt');
const { db } = require('./database');
const { isJwtIssuedBeforePasswordChange } = require('../utils/passwordSecurity');

// Local Strategy for email/password login
passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    async (email, password, done) => {
      try {
        // Find user by email
        const result = await db.execute({
          sql: 'SELECT * FROM users WHERE email = ?',
          args: [email],
        });

        const user = result.rows[0];

        if (!user) {
          return done(null, false, { message: 'El correo electrónico o la contraseña no son válidos' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
          return done(null, false, { message: 'El correo electrónico o la contraseña no son válidos' });
        }

        // Return user without password hash
        const userWithoutPassword = {
          id: user.id,
          email: user.email,
          role: user.role,
          full_name: user.full_name,
          created_at: user.created_at,
        };

        return done(null, userWithoutPassword);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// JWT Strategy for protecting routes
//
// passReqToCallback is on so the strategy can expose `req.impersonator`. It
// changes the verify signature to (req, payload, done) and nothing else: the
// resolution of `req.user` below is byte-for-byte what it was before.
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
  passReqToCallback: true,
};

passport.use(
  new JwtStrategy(jwtOptions, async (req, jwtPayload, done) => {
    try {
      // Find user by ID from JWT payload
      const result = await db.execute({
        sql: 'SELECT * FROM users WHERE id = ?',
        args: [jwtPayload.id],
      });

      const user = result.rows[0];

      if (!user) {
        return done(null, false);
      }

      // Sessions opened with a password that has since been changed stop
      // working here. Without this, changing a password leaves every JWT
      // issued with the old one valid for up to JWT_EXPIRES_IN (7 days) —
      // which is precisely the exposure an admin-initiated reset exists to
      // close. No extra query: the row is already loaded above.
      if (isJwtIssuedBeforePasswordChange(jwtPayload.iat, user.password_changed_at)) {
        return done(null, false);
      }

      // The token's own issue time, needed by the impersonation start endpoint
      // to stamp `act.iat` with the admin's real session iat rather than an
      // approximation of it. Additive: nothing else reads it.
      req.tokenIssuedAt = jwtPayload.iat;

      // Impersonation (admin-user-impersonation): the `act` claim of RFC 8693
      // names the admin acting as this user. It is deliberately the ONLY thing
      // that distinguishes an impersonation token from a login token — `req.user`
      // above is resolved from the target's row either way, which is what lets
      // every existing req.user check work untouched.
      //
      // A token without the claim leaves req.impersonator undefined, so nothing
      // that predates this change can observe a difference.
      if (jwtPayload.act && typeof jwtPayload.act === 'object') {
        req.impersonator = {
          id: jwtPayload.act.id,
          email: jwtPayload.act.email,
          sessionId: jwtPayload.act.sid,
          issuedAt: jwtPayload.act.iat,
        };
      }

      // Return user without password hash
      const userWithoutPassword = {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        created_at: user.created_at,
      };

      return done(null, userWithoutPassword);
    } catch (error) {
      return done(error, false);
    }
  })
);

module.exports = passport;
