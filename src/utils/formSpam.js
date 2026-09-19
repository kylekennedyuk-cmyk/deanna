/**
 * Layered anti-spam helpers for public enquiry forms (contact + planner submit).
 * Layers: honeypot, signed time trap, rate limits, content heuristics,
 * and optional Cloudflare Turnstile when enabled in Site Settings.
 */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { decryptSecret } = require('../config/settings');
const { safeLog } = require('./safeLog');

const HONEYPOT_FIELD = 'company_website';
const FORM_TS_FIELD = 'form_ts';
const TURNSTILE_FIELD = 'cf-turnstile-response';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const CONTACT_MIN_MS = 3 * 1000;
const PLANNER_MIN_MS = 12 * 1000;
const FORM_MAX_MS = 48 * 60 * 60 * 1000;

const NAME_MIN = 2;
const NAME_MAX = 100;
const EMAIL_MAX = 254;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const URL_IN_NAME_RE = /https?:\/\/|www\.|\/|\.[a-z]{2,}(\s|$)/i;
const LINK_RE = /https?:\/\/[^\s]+|www\.[^\s]+/gi;

const SPAM_KEYWORDS = [
  'viagra',
  'cialis',
  'casino',
  'forex',
  'crypto',
  'bitcoin',
  'nft',
  'seo service',
  'guest post',
  'backlink',
  'make money',
  'work from home',
  'weight loss',
  'onlyfans',
  'adult dating',
  'click here',
  'earn cash',
  'investment opportunity',
  'telegram @',
  'whatsapp +',
];

function getSigningSecret() {
  return process.env.SESSION_SECRET || 'dev-form-spam-secret';
}

function signTimestamp(ts36) {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(`form-ts:${ts36}`)
    .digest('hex')
    .slice(0, 20);
}

function issueFormTimestamp() {
  const ts36 = Date.now().toString(36);
  return `${ts36}.${signTimestamp(ts36)}`;
}

function checkFormTimestamp(token, { minMs = CONTACT_MIN_MS, maxMs = FORM_MAX_MS } = {}) {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing_timestamp' };
  }
  const [ts36, sig] = token.split('.');
  if (!ts36 || !sig || sig.length !== 20) {
    return { ok: false, reason: 'bad_timestamp' };
  }
  const expected = signTimestamp(ts36);
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: 'bad_timestamp_sig' };
    }
  } catch {
    return { ok: false, reason: 'bad_timestamp_sig' };
  }
  const renderedAt = parseInt(ts36, 36);
  if (!Number.isFinite(renderedAt)) {
    return { ok: false, reason: 'bad_timestamp' };
  }
  const ageMs = Date.now() - renderedAt;
  if (ageMs < minMs) {
    return { ok: false, reason: 'too_fast' };
  }
  if (ageMs > maxMs) {
    return { ok: false, reason: 'too_old' };
  }
  return { ok: true, ageMs };
}

function isHoneypotFilled(body = {}) {
  return String(body[HONEYPOT_FIELD] || '').trim().length > 0;
}

function stripSpamFields(body = {}) {
  const cleaned = { ...body };
  delete cleaned[HONEYPOT_FIELD];
  delete cleaned[FORM_TS_FIELD];
  delete cleaned[TURNSTILE_FIELD];
  delete cleaned._csrf;
  return cleaned;
}

function isTurnstileActive(settings = {}) {
  return (
    settings.turnstile_enabled === 'true' &&
    Boolean(String(settings.turnstile_site_key || '').trim()) &&
    Boolean(String(settings.turnstile_secret_key || '').trim())
  );
}

async function verifyTurnstileToken(token, settings = {}, remoteip = '') {
  if (!isTurnstileActive(settings)) {
    return { ok: true, skipped: true };
  }

  const response = String(token || '').trim();
  if (!response) {
    return { ok: false, reason: 'turnstile_missing' };
  }

  const secret = decryptSecret(settings.turnstile_secret_key || '');
  if (!secret) {
    return { ok: false, reason: 'turnstile_secret_invalid' };
  }

  try {
    const params = new URLSearchParams();
    params.set('secret', secret);
    params.set('response', response);
    if (remoteip) params.set('remoteip', remoteip);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let verifyRes;
    try {
      verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!verifyRes.ok) {
      return { ok: false, reason: 'turnstile_http_error' };
    }

    const data = await verifyRes.json();
    if (!data || data.success !== true) {
      const codes = Array.isArray(data && data['error-codes']) ? data['error-codes'] : [];
      return { ok: false, reason: 'turnstile_failed', codes };
    }
    return { ok: true };
  } catch (err) {
    safeLog(
      'warn',
      `form_spam turnstile verify error: ${err && err.message ? err.message : 'unknown'}`
    );
    return { ok: false, reason: 'turnstile_verify_error' };
  }
}

function countLinks(text) {
  const matches = String(text || '').match(LINK_RE);
  return matches ? matches.length : 0;
}

function linkDensity(text) {
  const raw = String(text || '');
  if (!raw.length) return 0;
  const links = raw.match(LINK_RE) || [];
  const linkChars = links.reduce((sum, part) => sum + part.length, 0);
  return linkChars / raw.length;
}

function spamKeywordScore(text) {
  const lower = String(text || '').toLowerCase();
  let score = 0;
  for (const keyword of SPAM_KEYWORDS) {
    if (lower.includes(keyword)) score += 1;
  }
  return score;
}

function validateContactPayload(body = {}) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();

  if (!name || !email || !message) {
    return { ok: false, softError: 'Name, email and message are required.' };
  }
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, softError: 'Please enter a name between 2 and 100 characters.' };
  }
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return { ok: false, softError: 'Please enter a valid email address.' };
  }
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return { ok: false, softError: 'Please enter a message between 10 and 5000 characters.' };
  }

  if (URL_IN_NAME_RE.test(name)) {
    return { ok: false, spamReason: 'url_in_name' };
  }

  const links = countLinks(message);
  if (links >= 3 || (links >= 2 && linkDensity(message) > 0.35) || (links >= 1 && linkDensity(message) > 0.5)) {
    return { ok: false, spamReason: 'link_heavy_message' };
  }

  const score = spamKeywordScore(`${name} ${email} ${message}`);
  if (score >= 2) {
    return { ok: false, spamReason: `keyword_score_${score}` };
  }

  return { ok: true, name, email, message };
}

function validatePlannerContact(data = {}) {
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const phone = data.phone != null ? String(data.phone).trim() : '';

  if (!name || !email) {
    return { ok: false, softError: 'Please include your name and email so Deanna can reply.' };
  }
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, softError: 'Please enter a name between 2 and 100 characters.' };
  }
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return { ok: false, softError: 'Please enter a valid email address.' };
  }
  if (URL_IN_NAME_RE.test(name)) {
    return { ok: false, spamReason: 'url_in_name' };
  }

  const freeText = [
    data.mustHaves,
    data.avoid,
    data.lands,
    data.accessibility,
    data.dietary,
    data.celebration,
    data.roomPrefs,
    phone,
  ]
    .map((v) => String(v || ''))
    .join(' ');

  const links = countLinks(freeText);
  if (links >= 3 || linkDensity(freeText) > 0.4) {
    return { ok: false, spamReason: 'link_heavy_prefs' };
  }

  const score = spamKeywordScore(`${name} ${email} ${freeText}`);
  if (score >= 2) {
    return { ok: false, spamReason: `keyword_score_${score}` };
  }

  return { ok: true, name, email, phone };
}

function clientMeta(req) {
  const ip = String(req.ip || '')
    .replace(/^::ffff:/, '')
    .slice(0, 45);
  return {
    ipPrefix: ip ? `${ip.split('.').slice(0, 2).join('.') || ip.slice(0, 8)}.*` : 'unknown',
    method: req.method,
    path: req.path,
  };
}

function logSpamReject(form, reason, req, extra = {}) {
  safeLog(
    'warn',
    `form_spam rejected form=${form} reason=${reason} meta=${JSON.stringify({ ...clientMeta(req), ...extra })}`
  );
}

function createEnquiryLimiter({ windowMs, max, form }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      logSpamReject(form, 'rate_limit', req, { max, windowMs });
      res.status(429).render('pages/error', {
        title: 'Please slow down',
        message: 'Too many requests from this connection. Please try again shortly.',
        status: 429,
      });
    },
  });
}

const contactLimiter = createEnquiryLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  form: 'contact',
});

const plannerStepLimiter = createEnquiryLimiter({
  windowMs: 60 * 60 * 1000,
  max: 40,
  form: 'planner_step',
});

const plannerSubmitLimiter = createEnquiryLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  form: 'planner_submit',
});

module.exports = {
  HONEYPOT_FIELD,
  FORM_TS_FIELD,
  TURNSTILE_FIELD,
  CONTACT_MIN_MS,
  PLANNER_MIN_MS,
  issueFormTimestamp,
  checkFormTimestamp,
  isHoneypotFilled,
  stripSpamFields,
  isTurnstileActive,
  verifyTurnstileToken,
  validateContactPayload,
  validatePlannerContact,
  logSpamReject,
  contactLimiter,
  plannerStepLimiter,
  plannerSubmitLimiter,
};