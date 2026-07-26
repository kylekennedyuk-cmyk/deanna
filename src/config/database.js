const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * SQLite write contention (Passenger + badge middleware + sessions) can surface
 * as SQLITE_BUSY. busy_timeout makes the engine wait briefly instead of failing.
 */
async function applySqlitePragmas() {
  try {
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
  } catch (err) {
    console.warn('[database] PRAGMA busy_timeout failed:', err.message || err);
  }
}

function isSqliteBusy(err) {
  if (!err) return false;
  if (err.code === 'P1008') return true;
  const msg = String(err.message || '');
  return /SQLITE_BUSY|database is locked|timed out/i.test(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry a few times on SQLITE_BUSY / lock timeouts. */
async function withSqliteRetry(fn, { retries = 4, delayMs = 40 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isSqliteBusy(err) || attempt === retries) throw err;
      await sleep(delayMs * attempt);
    }
  }
  throw lastErr;
}

module.exports = { prisma, applySqlitePragmas, withSqliteRetry, isSqliteBusy };
