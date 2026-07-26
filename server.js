const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createApp } = require('./src/app');
const { prisma, applySqlitePragmas } = require('./src/config/database');
const { safeLog } = require('./src/utils/safeLog');

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
 * Uncaught exceptions leave the process in an unknown state. Log loudly, then
 * exit so Phusion Passenger can respawn a clean worker. Do not swallow these.
 */
process.on('uncaughtException', (err) => {
  safeLog('fatal', 'Uncaught exception — exiting so Passenger can respawn', err);
  setTimeout(() => process.exit(1), 250).unref?.();
});

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
  }
}

async function ensureReady() {
  const dataDir = path.join(__dirname, 'data');
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  const logsDir = path.join(dataDir, 'logs');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

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

  await checkSchemaSanity();

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    safeLog(
      'warn',
      'Warning: database has no users. Run the "deploy" script (or npm run db:seed) to create the admin login.'
    );
  }
}

async function start() {
  try {
    await ensureReady();
  } catch (err) {
    safeLog(
      'error',
      `Startup check failed (app will still listen, but requests may 500): ${err.message}. ` +
        'Fix: create httpdocs/.env with DATABASE_URL, then Run script "deploy" or "update", then Restart App.',
      err
    );
  }

  // Passenger/Plesk injects PORT. Do not hardcode 3000 when PORT is unset under
  // a managed process — but keep 3000 as a local-dev fallback only.
  const port = Number(process.env.PORT || 3000);
  let app;
  try {
    app = createApp();
  } catch (err) {
    safeLog('fatal', 'createApp() threw during boot — exiting so Passenger can retry', err);
    process.exit(1);
    return;
  }

  const server = app.listen(port, () => {
    console.log(`Destinations With Deanna listening on port ${port}`);
    console.log('Admin login: username admin / password password');
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      safeLog(
        'error',
        `Port ${port} is already in use. Do not run "start" in Plesk while Passenger is managing the app. Use Run script "deploy", then click Restart App.`
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
