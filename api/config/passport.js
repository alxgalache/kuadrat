const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const bcrypt = require('bcrypt');
const { db } = require('./database');

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
          return done(null, false, { message: 'Invalid email or password' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
          return done(null, false, { message: 'Invalid email or password' });
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
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(
  new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
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
