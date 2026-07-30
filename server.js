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
let closeCachedTransport = () => {};

try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (err) {
  bootErr('dotenv.config', err);
}

try {
  ({ createApp } = require('./src/app'));
  ({ prisma, applySqlitePragmas } = require('./src/config/database'));
  ({ safeLog } = require('./src/utils/safeLog'));
  try {
    ({ closeCachedTransport } = require('./src/config/email'));
  } catch {
    closeCachedTransport = () => {};
  }
} catch (err) {
  bootErr('require(./src/*) — missing module or syntax error after incomplete npm install?', err);
  process.exit(1);
}

const underPassenger = typeof PhusionPassenger !== 'undefined';
const bootStartedAt = Date.now();

/** Active HTTP server — closed on SIGTERM/SIGINT so ports release cleanly. */
let httpServer = null;
let shuttingDown = false;
let memoryLogInterval = null;

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

function logMemory(label = 'periodic') {
  try {
    const mem = process.memoryUsage();
    const uptimeSec = Math.round(process.uptime());
    const msg =
      `[mem/${label}] uptime=${uptimeSec}s rss=${Math.round(mem.rss / 1024 / 1024)}MB ` +
      `heapUsed=${Math.round(mem.heapUsed / 1024 / 1024)}MB ` +
      `heapTotal=${Math.round(mem.heapTotal / 1024 / 1024)}MB`;
    console.log(`[boot] ${msg}`);
    try {
      safeLog('info', msg);
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

function startMemoryLogging() {
  if (memoryLogInterval) return;
  logMemory('boot');
  // Single interval only — do not accumulate timers on restarts within same process.
  memoryLogInterval = setInterval(() => logMemory('periodic'), 30 * 60 * 1000);
  if (typeof memoryLogInterval.unref === 'function') memoryLogInterval.unref();
}

/**
 * Graceful shutdown for SIGTERM/SIGINT only.
 * Closes HTTP, SMTP pool, Prisma — then exit(0).
 * Do NOT use exit(0) for listen failures (EADDRINUSE); that looks "clean" to
 * Passenger and often stops respawn → sticky sorry page until manual Restart.
 */
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[boot] ${signal} received — graceful shutdown`);
  try {
    safeLog('info', `${signal} received — graceful shutdown (uptime=${Math.round(process.uptime())}s)`);
  } catch {
    /* ignore */
  }

  if (memoryLogInterval) {
    clearInterval(memoryLogInterval);
    memoryLogInterval = null;
  }

  const finish = () => {
    try {
      closeCachedTransport();
    } catch {
      /* ignore */
    }
    Promise.resolve()
      .then(() => (prisma && prisma.$disconnect ? prisma.$disconnect() : undefined))
      .catch(() => {})
      .finally(() => {
        process.exit(0);
      });
  };

  const forceTimer = setTimeout(() => {
    console.error('[boot] Graceful shutdown timed out — exiting');
    process.exit(0);
  }, 8000);
  forceTimer.unref?.();

  if (httpServer && typeof httpServer.close === 'function') {
    httpServer.close(() => {
      clearTimeout(forceTimer);
      finish();
    });
    return;
  }

  clearTimeout(forceTimer);
  finish();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Best-effort: delete session files older than 14 days.
 * Batched across event-loop ticks so a huge data/sessions dir cannot freeze boot
 * or trip Passenger's startup timeout. Never call this before listen().
 */
function pruneOldSessionFilesAsync(options = {}) {
  const batchSize = Math.max(1, Number(options.batchSize) || 50);
  const sessionsDir = path.join(__dirname, 'data', 'sessions');
  const maxAgeMs = 14 * 24 * 60 * 60 * 1000;

  return new Promise((resolve) => {
    let names;
    try {
      if (!fs.existsSync(sessionsDir)) {
        resolve({ removed: 0, scanned: 0 });
        return;
      }
      names = fs.readdirSync(sessionsDir);
    } catch (err) {
      console.warn('[boot] Session prune skipped:', err && err.message ? err.message : err);
      resolve({ removed: 0, scanned: 0, error: true });
      return;
    }

    const now = Date.now();
    let index = 0;
    let removed = 0;
    const total = names.length;

    const processBatch = () => {
      const end = Math.min(index + batchSize, total);
      for (; index < end; index += 1) {
        const name = names[index];
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

      if (index < total) {
        setImmediate(processBatch);
        return;
      }

      if (removed) {
        try {
          safeLog('info', `Pruned ${removed} expired session file(s) (scanned=${total})`);
        } catch {
          console.log(`[boot] Pruned ${removed} expired session file(s) (scanned=${total})`);
        }
      }
      resolve({ removed, scanned: total });
    };

    setImmediate(processBatch);
  });
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

/**
 * Post-listen warmup only: dirs + DB checks. Session prune is separate and batched.
 * Soft-timeout so a hung DB open cannot hang the worker forever.
 */
async function ensureReady(options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 15000);

  const run = async () => {
    const dataDir = path.join(__dirname, 'data');
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    const logsDir = path.join(dataDir, 'logs');
    safeMkdir(dataDir);
    safeMkdir(uploadsDir);
    safeMkdir(path.join(dataDir, 'sessions'));
    safeMkdir(logsDir);

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
  };

  let timer;
  try {
    return await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`ensureReady timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

const EADDRINUSE_MAX_ATTEMPTS_LOCAL = 3;
const EADDRINUSE_BACKOFF_MS = [1000, 2000, 5000, 10000];

function eaddrInuseBackoffMs(attempt) {
  const idx = Math.min(Math.max(attempt - 1, 0), EADDRINUSE_BACKOFF_MS.length - 1);
  return EADDRINUSE_BACKOFF_MS[idx];
}

/**
 * Bind HTTP immediately (Passenger startup timeout requires a fast listen).
 *
 * EADDRINUSE:
 * - Under Passenger: retry forever with capped backoff (1s→2s→5s→10s). Never
 *   process.exit — exiting trips crash protection and leaves the site down.
 * - Local/dev: limited retries then exit(1).
 *
 * Never exit(0) on EADDRINUSE — Passenger treats that as a clean stop.
 */
function attachListen(app, target, attempt = 1) {
  const server = app.listen(target, () => {
    httpServer = server;
    console.log(
      `[boot] Destinations With Deanna listening on ${target} ` +
        `(passenger=${underPassenger}) attempt=${attempt} ` +
        `bootMs=${Date.now() - bootStartedAt}`
    );
    if (!underPassenger) {
      console.log('Admin login: username admin / password password');
    }
    startMemoryLogging();
  });

  server.on('error', (err) => {
    console.error(`[boot] Listen error on ${target}:`, err && err.stack ? err.stack : err);
    try {
      safeLog('error', `Listen error on ${target} (attempt ${attempt})`, err);
    } catch {
      /* ignore */
    }

    if (err && err.code === 'EADDRINUSE') {
      const delay = eaddrInuseBackoffMs(attempt);

      if (underPassenger) {
        const msg =
          `EADDRINUSE on ${target} (Passenger attempt ${attempt}, retry forever in ${delay}ms). ` +
          'Do not Run script "start" while Passenger manages the app. ' +
          'Keeping process alive — will not exit (avoids crash protection).';
        console.error(`[boot] ${msg}`);
        try {
          safeLog('error', msg, err);
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          try {
            attachListen(app, target, attempt + 1);
          } catch (retryErr) {
            bootErr('listen retry threw', retryErr);
            // Still do not exit under Passenger — schedule another attempt.
            setTimeout(() => {
              try {
                attachListen(app, target, attempt + 1);
              } catch {
                /* ignore */
              }
            }, eaddrInuseBackoffMs(attempt + 1)).unref?.();
          }
        }, delay).unref?.();
        return;
      }

      const msg =
        `EADDRINUSE on ${target} (attempt ${attempt}/${EADDRINUSE_MAX_ATTEMPTS_LOCAL}). ` +
        'Do not Run script "start" while Passenger manages the app. ' +
        'Use deploy/update, then Restart App.';
      console.error(`[boot] ${msg}`);
      try {
        safeLog('error', msg, err);
      } catch {
        /* ignore */
      }

      if (attempt < EADDRINUSE_MAX_ATTEMPTS_LOCAL) {
        console.error(`[boot] Retrying listen on ${target} in ${delay}ms…`);
        setTimeout(() => {
          try {
            attachListen(app, target, attempt + 1);
          } catch (retryErr) {
            bootErr('listen retry threw', retryErr);
            process.exit(1);
          }
        }, delay).unref?.();
        return;
      }

      setTimeout(() => process.exit(1), 250).unref?.();
      return;
    }

    // Non-EADDRINUSE: retry once on PORT (or 3000) after 500ms if target differed.
    const retryTarget =
      process.env.PORT != null && process.env.PORT !== '' ? process.env.PORT : 3000;
    if (String(retryTarget) !== String(target)) {
      console.error(`[boot] Retrying listen on ${retryTarget} in 500ms…`);
      setTimeout(() => {
        try {
          attachListen(app, retryTarget, 1);
        } catch (retryErr) {
          bootErr('listen retry threw', retryErr);
          if (!underPassenger) process.exit(1);
        }
      }, 500).unref?.();
      return;
    }

    if (underPassenger) {
      const delay = eaddrInuseBackoffMs(attempt);
      console.error(`[boot] Retrying same target ${target} under Passenger in ${delay}ms…`);
      setTimeout(() => {
        try {
          attachListen(app, target, attempt + 1);
        } catch (retryErr) {
          bootErr('listen retry threw', retryErr);
        }
      }, delay).unref?.();
      return;
    }

    console.error(`[boot] Retrying same target ${target} once in 500ms…`);
    setTimeout(() => {
      try {
        attachListen(app, target, attempt + 1);
      } catch (retryErr) {
        bootErr('listen retry threw', retryErr);
        process.exit(1);
      }
    }, 500).unref?.();
  });

  return server;
}

/**
 * Listen FIRST (Passenger requires a fast bind), then warm up AFTER.
 * Never await ensureReady / session prune before listen.
 */
function schedulePostListenWarmup() {
  setImmediate(() => {
    console.log('[boot] listen-first: starting async warmup (ensureReady + session prune)');
    (async () => {
      let schemaResult = { ok: false, missing: ['not-checked'] };
      try {
        schemaResult = await ensureReady({ timeoutMs: 15000 });
      } catch (err) {
        console.error(
          `[boot] Startup check failed (app is listening; requests may 500): ${err.message}`
        );
        if (err.stack) console.error(err.stack);
        try {
          safeLog(
            'error',
            `Startup check failed (app is listening; requests may 500): ${err.message}. ` +
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

      try {
        const prune = await pruneOldSessionFilesAsync({ batchSize: 50 });
        console.log(
          `[boot] session prune done removed=${prune.removed || 0} scanned=${prune.scanned || 0}`
        );
      } catch (err) {
        console.warn(
          '[boot] Session prune failed (non-fatal):',
          err && err.message ? err.message : err
        );
      }
    })().catch((err) => {
      console.error('[boot] Post-listen warmup rejected (non-fatal):', err && err.stack ? err.stack : err);
    });
  });
}

function start() {
  console.log(
    `[boot] listen-first node=${process.version} cwd=${process.cwd()} ` +
      `passenger=${underPassenger} PORT=${process.env.PORT || '(unset)'} ` +
      `DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'missing'} ` +
      `FORCE_CUSTOM_LISTEN=${process.env.PASSENGER_FORCE_CUSTOM_LISTEN || '0'}`
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
  // Bind immediately — do not await DB or session prune before this.
  attachListen(app, target);
  schedulePostListenWarmup();
}

try {
  start();
} catch (err) {
  bootErr('start() threw', err);
  try {
    safeLog('fatal', 'start() threw', err);
  } catch {
    /* ignore */
  }
  process.exit(1);
}
