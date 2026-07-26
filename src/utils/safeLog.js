const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB soft cap before rotate

/** Redact obvious secrets from log strings. Never log raw SMTP/IMAP passwords. */
function redact(value) {
  let text = String(value ?? '');
  text = text.replace(/(pass(?:word)?|secret|token|api[_-]?key)\s*[:=]\s*["']?[^"'&\s]+/gi, '$1=[REDACTED]');
  text = text.replace(/enc:v1:[A-Za-z0-9+/=]+/g, 'enc:v1:[REDACTED]');
  return text;
}

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* ignore — logging must never crash the app */
  }
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const size = fs.statSync(LOG_FILE).size;
    if (size < MAX_BYTES) return;
    const rotated = `${LOG_FILE}.1`;
    try {
      fs.unlinkSync(rotated);
    } catch {
      /* ignore */
    }
    fs.renameSync(LOG_FILE, rotated);
  } catch {
    /* ignore */
  }
}

function formatError(err) {
  if (!err) return '';
  if (err instanceof Error) {
    const stack = err.stack ? `\n${err.stack}` : '';
    const code = err.code ? ` code=${err.code}` : '';
    return `${err.message || err}${code}${stack}`;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Log to stderr (Passenger captures this) and optionally append to data/logs/app.log.
 * Never throws.
 */
function safeLog(level, message, err) {
  try {
    const stamp = new Date().toISOString();
    const detail = err ? `\n${formatError(err)}` : '';
    const line = redact(`[${stamp}] [${level}] ${message}${detail}`);
    if (level === 'error' || level === 'fatal') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
    try {
      ensureLogDir();
      rotateIfNeeded();
      fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
    } catch {
      /* ignore file logging failures */
    }
  } catch {
    try {
      console.error('[safeLog] failed to write log');
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  formatError,
  redact,
  safeLog,
};
