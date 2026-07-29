const path = require('path');
const fs = require('fs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);

function createSessionMiddleware() {
  const sessionsDir = path.join(__dirname, '..', '..', 'data', 'sessions');
  try {
    fs.mkdirSync(sessionsDir, { recursive: true });
  } catch (err) {
    console.error(
      '[session] Could not create sessions dir (continuing; FileStore may fail):',
      sessionsDir,
      err && err.stack ? err.stack : err
    );
  }

  return session({
    store: new FileStore({
      path: sessionsDir,
      ttl: 60 * 60 * 24 * 14, // 14 days — matches cookie maxAge
      retries: 1,
      // Reap expired session files so data/sessions cannot grow forever.
      // Hourly is enough; keep reapAsync so the interval does not block the event loop.
      reapInterval: 3600,
      reapAsync: true,
      reapMaxConcurrent: 5,
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
