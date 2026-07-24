const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const { prisma } = require('./database');

function configurePassport() {
  passport.use(
    new LocalStrategy(
      { usernameField: 'username', passwordField: 'password' },
      async (username, password, done) => {
        try {
          const identifier = String(username || '').trim().toLowerCase();
          const user = await prisma.user.findFirst({
            where: {
              OR: [{ username: identifier }, { email: identifier }],
            },
          });

          if (!user) {
            return done(null, false, { message: 'Invalid username or password.' });
          }

          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) {
            return done(null, false, { message: 'Invalid username or password.' });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user || false);
    } catch (err) {
      done(err);
    }
  });
}

module.exports = { configurePassport };
