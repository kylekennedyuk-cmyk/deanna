const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createApp } = require('./src/app');
const { prisma } = require('./src/config/database');

async function ensureReady() {
  const dataDir = path.join(__dirname, 'data');
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is missing. Create a .env file in httpdocs with DATABASE_URL=file:../data/deanna.db (Plesk Run script often ignores panel env vars).'
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `Database is not ready (${err.message}). In Plesk Node.js → Run script, type: deploy`
    );
  }

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    console.warn(
      'Warning: database has no users. Run the "deploy" script (or npm run db:seed) to create the admin login.'
    );
  }
}

async function start() {
  try {
    await ensureReady();
  } catch (err) {
    console.error('Startup check failed:', err.message);
  }

  // Passenger/Plesk injects PORT. Do not hardcode 3000 when PORT is unset under
  // a managed process — but keep 3000 as a local-dev fallback only.
  const port = Number(process.env.PORT || 3000);
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`Destinations With Deanna listening on port ${port}`);
    console.log('Admin login: username admin / password password');
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(
        `Port ${port} is already in use. Do not run "start" in Plesk while Passenger is managing the app. Use Run script "deploy", then click Restart App.`
      );
      process.exit(0);
    }
    console.error(err);
    process.exit(1);
  });
}

start();
