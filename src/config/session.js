const path = require('path');
const fs = require('fs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);

function createSessionMiddleware() {
  const sessionsDir = path.join(__dirname, '..', '..', 'data', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  return session({
    store: new FileStore({
      path: sessionsDir,
      ttl: 60 * 60 * 24 * 14,
      retries: 1,
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  });
}

module.exports = { createSessionMiddleware };
