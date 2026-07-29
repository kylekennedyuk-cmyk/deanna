const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createApp } = require('./src/app');
const { prisma, applySqlitePragmas } = require('./src/config/database');
const { safeLog } = require('./src/utils/safeLog');

const underPassenger = typeof PhusionPassenger !== 'undefined';

if (underPassenger) {
  // Recommended for Passenger-managed Node apps (Plesk): disable autoInstall
  // so we control listen() ourselves.
  try {
    PhusionPassenger.configure({ autoInstall: false });
  } catch (err) {
    safeLog('warn', 'PhusionPassenger.configure failed (continuing)', err);
  }
}

/**
 * Unhandled rejections are the most likely cause of intermittent Passenger
 * downtime: Node 20 terminates the process by default. Log and keep serving —
 * background mail/IMAP work must never take down the site.
 */
process.on('unhandledRejection', (reason) => {
  safeLog(
    'error',
    'Unhandled promise rejection (process kept alive for Passenger)',
    reason instanceof Error ? reason : new Error(String(reason))
  );
});

/**
 * Uncaught exceptions: prefer keeping the Passenger worker alive.
 * Exiting used to leave the site on the Phusion "could not be started" page
 * whenever respawn failed (port conflict, boot race after git pull).
 *
 * Only exit for clearly fatal conditions (OOM / heap). Everything else is
 * logged with a full stack and the process continues serving.
 */
const FATAL_EXCEPTION_CODES = new Set([
  'ERR_OUT_OF_MEMORY',
  'ERR_WORKER_OUT_OF_MEMORY',
  'ENOMEM',
]);

function isFatalUncaught(err) {
  if (!err) return false;
  if (err.code && FATAL_EXCEPTION_CODES.has(String(err.code))) return true;
  const text = `${err.message || ''}\n${err.stack || ''}`;
  return /out of memory|heap out of memory|ENOMEM|allocation failed/i.test(text);
}

process.on('uncaughtException', (err) => {
  safeLog('fatal', 'Uncaught exception (full stack below)', err);
  if (isFatalUncaught(err)) {
    safeLog(
      'fatal',
      'Fatal uncaught exception (OOM/critical) — exiting so Passenger can respawn',
      err
    );
    setTimeout(() => process.exit(1), 250).unref?.();
    return;
  }
  safeLog(
    'error',
    'Non-fatal uncaught exception — process kept alive to avoid Passenger sorry page',
    err
  );
});

/** Best-effort: delete session files older than 14 days so data/sessions cannot grow forever. */
function pruneOldSessionFiles() {
  const sessionsDir = path.join(__dirname, 'data', 'sessions');
  const maxAgeMs = 14 * 24 * 60 * 60 * 1000;
  try {
    if (!fs.existsSync(sessionsDir)) return;
    const now = Date.now();
    let removed = 0;
    for (const name of fs.readdirSync(sessionsDir)) {
      if (!name.endsWith('.json')) continue;
      const full = path.join(sessionsDir, name);
      try {
        const st = fs.statSync(full);
        if (now - st.mtimeMs > maxAgeMs) {
          fs.unlinkSync(full);
          removed += 1;
        }
      } catch {
        /* ignore per-file */
      }
    }
    if (removed) safeLog('info', `Pruned ${removed} expired session file(s)`);
  } catch (err) {
    safeLog('warn', 'Session prune skipped', err);
  }
}

function safeMkdir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (err) {
    safeLog('warn', `Could not create directory ${dir} (continuing boot)`, err);
    return false;
  }
}

async function checkSchemaSanity() {
  const checks = [
    {
      name: 'MessageRead',
      run: () => prisma.messageRead.findFirst({ select: { id: true } }),
    },
    {
      name: 'ChangeRequest',
      run: () => prisma.changeRequest.findFirst({ select: { id: true } }),
    },
    {
      name: 'HolidayPlan.bookingReference',
      run: () =>
        prisma.holidayPlan.findFirst({
          select: { id: true, bookingReference: true, confirmationDetails: true },
        }),
    },
    {
      name: 'User.messageReadsInitialized',
      run: () =>
        prisma.user.findFirst({
          select: { id: true, messageReadsInitialized: true },
        }),
    },
  ];

  const missing = [];
  for (const check of checks) {
    try {
      await check.run();
    } catch (err) {
      missing.push(`${check.name} (${err.code || err.message})`);
    }
  }

  if (missing.length) {
    safeLog(
      'error',
      `Database schema appears out of date. Missing or broken: ${missing.join('; ')}. ` +
        'In Plesk Node.js → Run script, type: update  (runs prisma generate && prisma db push). ' +
        'Then Restart App. Until then badge/booking features may error.'
    );
    return { ok: false, missing };
  }

  return { ok: true, missing: [] };
}

async function ensureReady() {
  const dataDir = path.join(__dirname, 'data');
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  const logsDir = path.join(dataDir, 'logs');
  safeMkdir(dataDir);
  safeMkdir(uploadsDir);
  safeMkdir(path.join(dataDir, 'sessions'));
  safeMkdir(logsDir);
  pruneOldSessionFiles();

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is missing. Create a .env file in httpdocs with DATABASE_URL=file:../data/deanna.db (Plesk Run script often ignores panel env vars).'
    );
  }

  try {
    await applySqlitePragmas();
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `Database is not ready (${err.message}). In Plesk Node.js → Run script, type: deploy  then Restart App.`
    );
  }

  const schema = await checkSchemaSanity();

  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      safeLog(
        'warn',
        'Warning: database has no users. Run the "deploy" script (or npm run db:seed) to create the admin login.'
      );
    }
  } catch (err) {
    safeLog('warn', 'Could not count users during startup (continuing)', err);
  }

  return schema;
}

function listenTarget() {
  // Plesk Node + Passenger injects PORT (often a Unix socket path or port string).
  // Always prefer it. Only fall back to the classic 'passenger' socket name when
  // under Passenger with no PORT; local dev uses 3000.
  if (process.env.PORT) return process.env.PORT;
  if (underPassenger) return 'passenger';
  return 3000;
}

async function start() {
  console.log(
    `[boot] node=${process.version} cwd=${process.cwd()} ` +
      `passenger=${underPassenger} PORT=${process.env.PORT || '(unset)'} ` +
      `DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'missing'}`
  );

  let schemaResult = { ok: false, missing: ['not-checked'] };
  try {
    schemaResult = await ensureReady();
  } catch (err) {
    safeLog(
      'error',
      `Startup check failed (app will still listen, but requests may 500): ${err.message}. ` +
        'Fix: create httpdocs/.env with DATABASE_URL, then Run script "deploy" or "update", then Restart App.',
      err
    );
  }

  console.log(
    `[boot] schemaSanity=${schemaResult.ok ? 'ok' : 'fail'}` +
      (schemaResult.missing && schemaResult.missing.length
        ? ` missing=${schemaResult.missing.join(',')}`
        : '')
  );

  let app;
  try {
    app = createApp();
  } catch (err) {
    safeLog('fatal', 'createApp() threw during boot — exiting so Passenger can retry', err);
    process.exit(1);
    return;
  }

  const target = listenTarget();
  const server = app.listen(target, () => {
    console.log(
      `[boot] Destinations With Deanna listening on ${target} ` +
        `(passenger=${underPassenger})`
    );
    if (!underPassenger) {
      console.log('Admin login: username admin / password password');
    }
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      safeLog(
        'error',
        `Listen target ${target} is already in use. Do not run "start" in Plesk while Passenger is managing the app. Use Run script "deploy", then click Restart App.`
      );
      process.exit(0);
    }
    safeLog('fatal', 'HTTP server error', err);
    process.exit(1);
  });
}

start().catch((err) => {
  safeLog('fatal', 'start() rejected', err);
  process.exit(1);
});
