/**
 * Plesk / Phusion Passenger entrypoint.
 *
 * Keep listen wiring minimal: Plesk injects PORT and expects a plain
 * app.listen(process.env.PORT). Do NOT call PhusionPassenger.configure
 * unless PASSENGER_FORCE_CUSTOM_LISTEN=1 — configure({ autoInstall: false })
 * breaks boot on many Plesk setups when listen wiring is wrong.
 */
const path = require('path');
const fs = require('fs');

function bootErr(label, err) {
  const e = err instanceof Error ? err : new Error(String(err));
  // Always print to stderr FIRST — safeLog / file logging may not be loadable yet.
  console.error(`[boot] FATAL ${label}:`, e.message);
  if (e.stack) console.error(e.stack);
}

let createApp;
let prisma;
let applySqlitePragmas;
let safeLog;

try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (err) {
  bootErr('dotenv.config', err);
}

try {
  ({ createApp } = require('./src/app'));
  ({ prisma, applySqlitePragmas } = require('./src/config/database'));
  ({ safeLog } = require('./src/utils/safeLog'));
} catch (err) {
  bootErr('require(./src/*) — missing module or syntax error after incomplete npm install?', err);
  process.exit(1);
}

const underPassenger = typeof PhusionPassenger !== 'undefined';

// Only disable Passenger autoInstall when explicitly opted in.
// Default Plesk pattern: no configure() call; listen on process.env.PORT.
if (underPassenger && process.env.PASSENGER_FORCE_CUSTOM_LISTEN === '1') {
  try {
    // eslint-disable-next-line no-undef
    PhusionPassenger.configure({ autoInstall: false });
    console.log('[boot] PhusionPassenger.configure({ autoInstall: false }) (PASSENGER_FORCE_CUSTOM_LISTEN=1)');
  } catch (err) {
    bootErr('PhusionPassenger.configure', err);
    try {
      safeLog('warn', 'PhusionPassenger.configure failed (continuing)', err);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Unhandled rejections must not kill the Passenger worker (Node 20 default).
 */
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('[boot] Unhandled promise rejection (kept alive):', err.stack || err.message);
  try {
    safeLog('error', 'Unhandled promise rejection (process kept alive for Passenger)', err);
  } catch {
    /* ignore */
  }
});

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
  console.error('[boot] Uncaught exception:', err && err.stack ? err.stack : err);
  try {
    safeLog('fatal', 'Uncaught exception (full stack below)', err);
  } catch {
    /* ignore */
  }
  if (isFatalUncaught(err)) {
    setTimeout(() => process.exit(1), 250).unref?.();
    return;
  }
  try {
    safeLog(
      'error',
      'Non-fatal uncaught exception — process kept alive to avoid Passenger sorry page',
      err
    );
  } catch {
    /* ignore */
  }
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
    if (removed) {
      try {
        safeLog('info', `Pruned ${removed} expired session file(s)`);
      } catch {
        console.log(`[boot] Pruned ${removed} expired session file(s)`);
      }
    }
  } catch (err) {
    console.warn('[boot] Session prune skipped:', err && err.message ? err.message : err);
  }
}

function safeMkdir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (err) {
    console.warn(`[boot] Could not create directory ${dir}:`, err && err.message ? err.message : err);
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
    const msg =
      `Database schema appears out of date. Missing or broken: ${missing.join('; ')}. ` +
      'In Plesk Node.js → Run script, type: update  (runs prisma generate && prisma db push). ' +
      'Then Restart App. Until then badge/booking features may error.';
    console.error(`[boot] ${msg}`);
    try {
      safeLog('error', msg);
    } catch {
      /* ignore */
    }
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
      console.warn(
        '[boot] Warning: database has no users. Run the "deploy" script (or npm run db:seed) to create the admin login.'
      );
    }
  } catch (err) {
    console.warn('[boot] Could not count users during startup:', err && err.message ? err.message : err);
  }

  return schema;
}

/**
 * Plesk-safe listen target: use PORT as-is (string OK for Unix socket paths).
 * Never use the literal string 'passenger' unless PASSENGER_FORCE_CUSTOM_LISTEN=1
 * and PORT is unset.
 */
function listenTarget() {
  if (process.env.PORT != null && process.env.PORT !== '') {
    return process.env.PORT;
  }
  if (underPassenger && process.env.PASSENGER_FORCE_CUSTOM_LISTEN === '1') {
    return 'passenger';
  }
  return 3000;
}

function attachListen(app, target) {
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
    console.error(`[boot] Listen error on ${target}:`, err && err.stack ? err.stack : err);
    if (err && err.code === 'EADDRINUSE') {
      console.error(
        `[boot] Listen target ${target} is already in use. Do not run "start" in Plesk while Passenger is managing the app. Use Run script "deploy"/"update", then Restart App.`
      );
      // Exit 0 so Passenger is less likely to stick on a hard sorry-page loop from a conflict.
      process.exit(0);
      return;
    }

    // Non-fatal first failure: retry once on PORT (or 3000) after 500ms.
    const retryTarget =
      process.env.PORT != null && process.env.PORT !== '' ? process.env.PORT : 3000;
    if (String(retryTarget) !== String(target)) {
      console.error(`[boot] Retrying listen on ${retryTarget} in 500ms…`);
      setTimeout(() => {
        try {
          attachListen(app, retryTarget);
        } catch (retryErr) {
          bootErr('listen retry threw', retryErr);
          process.exit(1);
        }
      }, 500).unref?.();
      return;
    }

    console.error(`[boot] Retrying same target ${target} once in 500ms…`);
    let retried = false;
    setTimeout(() => {
      if (retried) return;
      retried = true;
      const retryServer = app.listen(target, () => {
        console.log(`[boot] Listen retry succeeded on ${target}`);
      });
      retryServer.on('error', (err2) => {
        bootErr('listen retry failed', err2);
        process.exit(1);
      });
    }, 500).unref?.();
  });

  return server;
}

async function start() {
  console.log(
    `[boot] node=${process.version} cwd=${process.cwd()} ` +
      `passenger=${underPassenger} PORT=${process.env.PORT || '(unset)'} ` +
      `DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'missing'} ` +
      `FORCE_CUSTOM_LISTEN=${process.env.PASSENGER_FORCE_CUSTOM_LISTEN || '0'}`
  );

  let schemaResult = { ok: false, missing: ['not-checked'] };
  try {
    schemaResult = await ensureReady();
  } catch (err) {
    console.error(
      `[boot] Startup check failed (app will still listen, but requests may 500): ${err.message}`
    );
    if (err.stack) console.error(err.stack);
    try {
      safeLog(
        'error',
        `Startup check failed (app will still listen, but requests may 500): ${err.message}. ` +
          'Fix: create httpdocs/.env with DATABASE_URL, then Run script "deploy" or "update", then Restart App.',
        err
      );
    } catch {
      /* ignore */
    }
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
    bootErr('createApp() threw during boot', err);
    try {
      safeLog('fatal', 'createApp() threw during boot — exiting so Passenger can retry', err);
    } catch {
      /* ignore */
    }
    process.exit(1);
    return;
  }

  const target = listenTarget();
  attachListen(app, target);
}

start().catch((err) => {
  bootErr('start() rejected', err);
  try {
    safeLog('fatal', 'start() rejected', err);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
