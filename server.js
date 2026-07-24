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
      'DATABASE_URL is missing. Add DATABASE_URL=file:../data/deanna.db to your .env (or Plesk environment variables).'
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
    console.error('Startup failed:', err.message);
    process.exit(1);
  }

  const port = Number(process.env.PORT || 3000);
  const app = createApp();
  app.listen(port, () => {
    console.log(`Destinations With Deanna listening on port ${port}`);
    console.log('Admin login: username admin / password password');
  });
}

start();
