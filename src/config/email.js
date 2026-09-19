const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { decryptSecret, getSettings } = require('./settings');

/** Default sending domain for Destinations With Deanna (SPF/DKIM/DMARC). */
const MAIL_DOMAIN = 'destinationswithdeanna.com';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Extract bare email address from `Name <addr>` or plain addr. */
function extractEmailAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

function emailDomain(address) {
  const addr = extractEmailAddress(address);
  const at = addr.lastIndexOf('@');
  if (at < 0) return '';
  return addr.slice(at + 1).toLowerCase();
}

/**
 * Prefer From that SPF/DKIM can align with: same mailbox as SMTP auth when possible,
 * and never invent a From on a foreign domain.
 */
function resolveAlignedFromEmail(settings) {
  const configured = extractEmailAddress(settings.fromEmail);
  const smtpUser = extractEmailAddress(settings.user);
  const smtpDomain = emailDomain(smtpUser);
  const configuredDomain = emailDomain(configured);

  if (configured && smtpUser && configured === smtpUser) return configured;

  if (configured && smtpDomain && configuredDomain === smtpDomain) return configured;

  if (smtpUser && smtpDomain) {
    if (configured && configuredDomain && configuredDomain !== smtpDomain) {
      console.warn(
        `[email] From ${configured} domain does not match SMTP user ${smtpUser}; using SMTP mailbox for SPF/DMARC alignment`
      );
    }
    return smtpUser;
  }

  if (configured && configuredDomain === MAIL_DOMAIN) return configured;

  if (configured) {
    console.warn(
      `[email] Refusing foreign From domain ${configuredDomain || '(none)'}; falling back to support mailbox on ${MAIL_DOMAIN}`
    );
  }
  return `dee@${MAIL_DOMAIN}`;
}

/** Optional app-side DKIM (prefer Plesk/Prime server signing). Private key from env only. */
function resolveDkimOptions(fromDomain) {
  const privateKeyRaw = process.env.DKIM_PRIVATE_KEY || '';
  const selector = String(process.env.DKIM_SELECTOR || '').trim();
  if (!privateKeyRaw || !selector) return null;

  const domainName = String(process.env.DKIM_DOMAIN || fromDomain || MAIL_DOMAIN)
    .trim()
    .toLowerCase();
  const privateKey = privateKeyRaw.includes('\\n')
    ? privateKeyRaw.replace(/\\n/g, '\n')
    : privateKeyRaw;

  return {
    domainName,
    keySelector: selector,
    privateKey,
  };
}

const EMAIL_PARAGRAPH_STYLE =
  'margin:0 0 16px;font-size:16px;line-height:1.65;color:#1a2b40';
const EMAIL_LINK_STYLE = 'color:#1a2b40;text-decoration:underline';

/** Light markdown on already-escaped text: **bold**, *italic*. */
function applyLightMarkdown(escaped) {
  return String(escaped || '')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/** Auto-link http(s) URLs in already-escaped text; strip trailing punctuation from the URL. */
function linkifyEscapedUrls(escaped) {
  return String(escaped || '').replace(/https?:\/\/[^\s<]+/gi, (rawUrl) => {
    let url = rawUrl;
    let trailing = '';
    while (url && /[.,;:!?)\]'"”’]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    if (!/^https?:\/\//i.test(url)) return rawUrl;
    return `<a href="${url}" style="${EMAIL_LINK_STYLE}" target="_blank">${url}</a>${trailing}`;
  });
}

/**
 * Convert plain text into safe email HTML paragraphs.
 * Escapes HTML first, then blank lines → <p>, single newlines → <br />,
 * http(s) auto-links, and optional **bold** / *italic*.
 */
function plainTextToEmailHtml(text) {
  const escaped = escapeHtml(text);
  const blocks = escaped
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) return '';

  return blocks
    .map((block) => {
      const withMarkdown = applyLightMarkdown(block);
      const withLinks = linkifyEscapedUrls(withMarkdown);
      const withBreaks = withLinks.replace(/\n/g, '<br />');
      return `<p style="${EMAIL_PARAGRAPH_STYLE}">${withBreaks}</p>`;
    })
    .join('');
}

function interpolate(template, values) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (match, key) =>
    values[key] === undefined ? match : String(values[key])
  );
}

/** Fix common host typos (prime.sx is not the mail server — prime.ax is). */
function normalizeSmtpHost(host) {
  const value = String(host || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'prime.sx' || value === 'prime.as' || value === 'prine.ax') {
    return 'prime.ax';
  }
  return String(host || '').trim();
}

async function resolveEmailSettings() {
  const stored = await getSettings();
  const port = Number(stored.smtp_port || process.env.SMTP_PORT || 587);
  const secureFlag =
    stored.smtp_secure === 'true' ||
    String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  // Port 465 is always implicit TLS; port 587 uses STARTTLS when not marked secure.
  const secure = port === 465 || secureFlag;
  const encryptedPass = stored.smtp_pass || '';
  const decryptedPass = decryptSecret(encryptedPass);
  const passBroken =
    Boolean(encryptedPass) &&
    String(encryptedPass).startsWith('enc:v1:') &&
    !decryptedPass &&
    !process.env.SMTP_PASS;

  return {
    enabled: stored.email_notifications_enabled !== 'false',
    host: normalizeSmtpHost(stored.smtp_host || process.env.SMTP_HOST || ''),
    port,
    secure,
    requireTLS: port === 587 && !secure,
    user: String(stored.smtp_user || process.env.SMTP_USER || '').trim(),
    pass: decryptedPass || process.env.SMTP_PASS || '',
    passBroken,
    fromName:
      stored.smtp_from_name ||
      process.env.SMTP_FROM_NAME ||
      'Destinations With Deanna',
    fromEmail: String(
      stored.smtp_from_email ||
        process.env.SMTP_FROM_EMAIL ||
        (process.env.SMTP_FROM || '').replace(/^.*<([^>]+)>.*$/, '$1').trim() ||
        process.env.SUPPORT_EMAIL ||
        ''
    ).trim(),
    replyTo: String(
      stored.smtp_reply_to || stored.support_email || process.env.SUPPORT_EMAIL || ''
    ).trim(),
    siteName: stored.site_name || 'Destinations With Deanna',
    logoUrl: stored.logo_url || '',
    primaryColour: stored.primary_colour || '#1a2b40',
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    templates: stored,
  };
}

function transportBlockReason(settings) {
  if (!settings.enabled) {
    return 'Email notifications are disabled. Turn on “Notifications enabled” and save.';
  }
  if (!settings.host) {
    return 'SMTP host is missing. Enter prime.ax (or your mail host) and save.';
  }
  if (!settings.user) {
    return 'SMTP username is missing. Use the full mailbox address, e.g. dee@destinationswithdeanna.com.';
  }
  if (settings.passBroken) {
    return 'Saved SMTP password cannot be decrypted (encryption key changed). Re-enter the mailbox password and save.';
  }
  if (!settings.pass) {
    return 'SMTP password is missing. Enter the mailbox password and save.';
  }
  const alignedFrom = resolveAlignedFromEmail(settings);
  if (!alignedFrom || !emailDomain(alignedFrom)) {
    return 'From email is missing. Use the same mailbox address you authenticate with (e.g. dee@destinationswithdeanna.com).';
  }
  const fromDomain = emailDomain(alignedFrom);
  const userDomain = emailDomain(settings.user);
  if (userDomain && fromDomain && userDomain !== fromDomain) {
    return `From domain (${fromDomain}) must match the SMTP username domain (${userDomain}) so SPF/DMARC can align.`;
  }
  if (fromDomain && fromDomain !== MAIL_DOMAIN) {
    return `From address must be on ${MAIL_DOMAIN} (got ${fromDomain}). Do not send as a foreign domain.`;
  }
  return null;
}

function transportCacheKey(settings) {
  return [
    settings.host,
    settings.port,
    settings.secure ? '1' : '0',
    settings.requireTLS ? '1' : '0',
    settings.user,
    settings.pass,
  ].join('\u0000');
}

let cachedTransport = null;
let cachedKey = '';
/** Close pooled SMTP after idle so Passenger workers do not hold sockets forever. */
const TRANSPORT_IDLE_CLOSE_MS = 5 * 60 * 1000;
let transportIdleTimer = null;

function closeCachedTransport() {
  if (transportIdleTimer) {
    clearTimeout(transportIdleTimer);
    transportIdleTimer = null;
  }
  if (!cachedTransport) return;
  try {
    cachedTransport.close();
  } catch {
    /* ignore */
  }
  cachedTransport = null;
  cachedKey = '';
}

function buildTransport(settings) {
  const fromEmail = resolveAlignedFromEmail(settings);
  const dkim = resolveDkimOptions(emailDomain(fromEmail));
  const options = {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: settings.requireTLS,
    auth: {
      user: settings.user,
      pass: settings.pass,
    },
    // Keep one warm connection instead of reconnecting on every email.
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 8000,
    // Avoid slow IPv6 → IPv4 fallback delays on some hosts.
    family: 4,
    tls: {
      servername: settings.host,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    },
  };
  // Prefer Plesk/Prime DKIM signing; env DKIM_* is an optional app-side fallback.
  if (dkim) options.dkim = dkim;
  // Identifies this app in SMTP conversation / X-Mailer fallbacks (not a spam trick).
  options.name = 'DestinationsWithDeanna';
  return nodemailer.createTransport(options);
}

/** Alternate configs to try when the primary SMTP endpoint is flaky. */
function alternateSettings(settings) {
  const alts = [];
  if (settings.port === 465) {
    alts.push({
      ...settings,
      port: 587,
      secure: false,
      requireTLS: true,
    });
  } else if (settings.port === 587) {
    alts.push({
      ...settings,
      port: 465,
      secure: true,
      requireTLS: false,
    });
  }
  return alts;
}

async function createTransport(settingsOverride = null) {
  const settings = settingsOverride || (await resolveEmailSettings());
  const reason = transportBlockReason(settings);
  if (reason) return { transport: null, settings, reason };

  const key = transportCacheKey(settings);
  if (cachedTransport && cachedKey === key) {
    return { transport: cachedTransport, settings, reason: null };
  }

  closeCachedTransport();
  cachedTransport = buildTransport(settings);
  cachedKey = key;
  return { transport: cachedTransport, settings, reason: null };
}

function isTransientSmtpError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const message = String(err.message || '').toLowerCase();
  const responseCode = Number(err.responseCode || 0);
  if (
    [
      'ETIMEDOUT',
      'ESOCKETTIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'ENOTFOUND',
      'ESOCKET',
      'ECONNECTION',
      'EPIPE',
    ].includes(code)
  ) {
    return true;
  }
  if (message.includes('timeout') || message.includes('socket') || message.includes('connection')) {
    return true;
  }
  if (responseCode === 421 || responseCode === 450 || responseCode === 451 || responseCode === 452) {
    return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build headers that help Gmail/Outlook classify portal mail as transactional
 * (not bulk marketing). Do not set Precedence: bulk or List-Unsubscribe here —
 * those are for newsletters and can make 1:1 planning mail look like a list.
 */
function buildTransactionalHeaders({ fromDomain, category }) {
  const headers = {
    // Helps filters treat this as system mail, not a cold bulk blast.
    'Auto-Submitted': 'auto-generated',
    'X-Auto-Response-Suppress': 'OOF, AutoReply, DR, NRN, RN',
    // Stable product identity (avoids generic "Nodemailer" as the only signal).
    'X-Mailer': 'DestinationsWithDeanna-Portal',
  };
  if (category) {
    headers['X-Entity-Ref-ID'] = `${category}@${fromDomain}`;
  }
  return headers;
}

/** Prefer a real text/plain part; strip tags from HTML only as a last resort. */
function ensurePlainText(text, html) {
  const plain = String(text || '').trim();
  if (plain) return plain;
  const fromHtml = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return fromHtml || 'Message from Destinations With Deanna.';
}

async function sendMailOnce(transport, settings, payload) {
  const fromEmail = resolveAlignedFromEmail(settings);
  const fromDomain = emailDomain(fromEmail) || MAIL_DOMAIN;
  const replyTo =
    extractEmailAddress(payload.replyTo) ||
    extractEmailAddress(settings.replyTo) ||
    fromEmail;
  const messageId = `<${crypto.randomBytes(16).toString('hex')}@${fromDomain}>`;
  const envelopeTo = []
    .concat(payload.to || [])
    .concat(payload.cc || [])
    .flatMap((entry) => String(entry || '').split(/[,;]/))
    .map((part) => extractEmailAddress(part))
    .filter(Boolean);

  // Human mailbox compose is person-to-person; notifications are auto-generated.
  const isTransactional = payload.transactional !== false && payload.human !== true;
  const text = ensurePlainText(payload.text, payload.html);
  const html = payload.html || undefined;

  return transport.sendMail({
    from: `"${settings.fromName}" <${fromEmail}>`,
    replyTo: replyTo || undefined,
    // Explicit MAIL FROM / Return-Path so SPF checks the domain we publish.
    envelope: {
      from: fromEmail,
      to: envelopeTo.length ? envelopeTo : undefined,
    },
    messageId,
    date: new Date(),
    to: payload.to,
    cc: payload.cc || undefined,
    subject: payload.subject,
    text,
    html,
    inReplyTo: payload.inReplyTo || undefined,
    references: payload.references || undefined,
    attachments: payload.attachments && payload.attachments.length ? payload.attachments : undefined,
    headers: isTransactional
      ? buildTransactionalHeaders({
          fromDomain,
          category: payload.category || 'notification',
        })
      : {
          'X-Mailer': 'DestinationsWithDeanna-Mailbox',
        },
  });
}

async function sendMail(payload) {
  const primary = await resolveEmailSettings();
  const reason = transportBlockReason(primary);
  if (reason) {
    console.log(`[email skipped] To: ${payload.to} | ${payload.subject} | ${reason}`);
    return { skipped: true, reason };
  }

  const configs = [primary, ...alternateSettings(primary)];
  let lastError = null;

  for (let configIndex = 0; configIndex < configs.length; configIndex += 1) {
    const settings = configs[configIndex];
    if (configIndex > 0) closeCachedTransport();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const { transport } = await createTransport(settings);
      if (!transport) continue;

      try {
        const info = await sendMailOnce(transport, settings, payload);
        if (configIndex > 0) {
          console.warn(
            `[email] sent via fallback ${settings.host}:${settings.port} (secure=${settings.secure})`
          );
        }
        return info;
      } catch (err) {
        lastError = err;
        console.warn(
          `[email] ${settings.host}:${settings.port} attempt ${attempt} failed: ${err.message || err}`
        );
        closeCachedTransport();
        if (attempt < 2 && isTransientSmtpError(err)) {
          await sleep(350 * attempt);
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error('Email send failed.');
}

function brandedLayout(settings, { heading, intro, bodyHtml, buttonLabel, buttonUrl }) {
  const logoSrc = settings.logoUrl
    ? escapeHtml(
        settings.logoUrl.startsWith('http')
          ? settings.logoUrl
          : `${settings.appUrl}${settings.logoUrl}`
      )
    : '';
  // Keep natural aspect ratio — many email clients stretch imgs without height:auto + width:auto.
  // White padding box around the logo so dark-mode clients keep it readable.
  const logo = logoSrc
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#ffffff" style="margin:0 auto;background-color:#ffffff"><tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;text-align:center;padding:8px 16px">
        <img src="${logoSrc}" alt="${escapeHtml(settings.siteName)}" width="200" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;width:auto;max-width:200px;height:auto;max-height:72px" />
      </td></tr></table>`
    : `<div style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#1a2b40;text-align:center;background-color:#ffffff">${escapeHtml(settings.siteName)}</div>`;

  const button =
    buttonLabel && buttonUrl
      ? `<p style="margin:28px 0"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:${escapeHtml(settings.primaryColour)};color:#fff;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:700">${escapeHtml(buttonLabel)}</a></p>`
      : '';

  const introHtml = String(intro || '').trim()
    ? `<p style="font-size:16px;line-height:1.65;color:#3d5b79;margin:0 0 20px">${escapeHtml(intro)}</p>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;background:#fbf8f3;font-family:Arial,sans-serif;color:#1a2b40">
  <div style="padding:32px 16px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 35px rgba(15,26,40,.08)">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;width:100%">
        <tr>
          <td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:36px 36px 20px;text-align:center">${logo}</td>
        </tr>
      </table>
      <div style="padding:0 36px 36px">
        <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.2;margin:0 0 16px;color:#1a2b40">${escapeHtml(heading)}</h1>
        ${introHtml}
        <div style="font-size:16px;line-height:1.65;color:#1a2b40">${bodyHtml}</div>
        ${button}
      </div>
      <div style="background:#1a2b40;color:#e4ebf3;padding:22px 36px;font-size:13px;line-height:1.5">
        Sent by ${escapeHtml(settings.siteName)}. Reply to this email if you need help.
      </div>
    </div>
  </div>
</body></html>`;
}

const defaults = {
  new_request: {
    subject: 'New holiday planning request: {{planTitle}}',
    heading: 'A new planning request has arrived',
    intro: '{{customerName}} has submitted a Disneyland Paris holiday request.',
  },
  customer_confirmation: {
    subject: 'We have received your holiday plan',
    heading: 'Your planning request is with Deanna',
    intro: 'Thank you, {{customerName}}. Deanna will review your dates and preferences before getting in touch.',
  },
  new_message: {
    subject: 'New message about {{planTitle}}',
    heading: 'You have a new message',
    intro: '{{senderName}} has sent a message about {{planTitle}}.',
  },
  status_update: {
    subject: 'Your holiday plan is now {{status}}',
    heading: 'Your plan has been updated',
    intro: 'The status of {{planTitle}} is now {{status}}.',
  },
  password_reset: {
    subject: 'Reset your password',
    heading: 'Reset your portal password',
    intro: 'Use the secure link below to choose a new password. The link expires in one hour.',
  },
  contact: {
    subject: 'New website enquiry from {{customerName}}',
    heading: 'A new website enquiry has arrived',
    intro: '{{customerName}} has sent a message through the contact page.',
  },
};

async function sendNotification(type, { to, values = {}, body = '', buttonLabel, buttonUrl }) {
  const settings = await resolveEmailSettings();
  const fallback = defaults[type] || defaults.new_message;
  const subjectTemplate = settings.templates[`email_${type}_subject`] || fallback.subject;
  const headingTemplate = settings.templates[`email_${type}_heading`] || fallback.heading;
  const introTemplate = settings.templates[`email_${type}_intro`] || fallback.intro;
  const subject = interpolate(subjectTemplate, values);
  const heading = interpolate(headingTemplate, values);
  const intro = interpolate(introTemplate, values);
  const formattedBody = plainTextToEmailHtml(body);
  const bodyHtml = `<div style="background:#f3f6fa;border-radius:14px;padding:18px">${formattedBody || `<p style="${EMAIL_PARAGRAPH_STYLE}"> </p>`}</div>`;
  const html = brandedLayout(settings, {
    heading,
    intro,
    bodyHtml,
    buttonLabel,
    buttonUrl,
  });
  const text = [
    heading,
    '',
    intro,
    body ? `\n${body}` : '',
    buttonUrl ? `\n${buttonLabel || 'Open link'}: ${buttonUrl}` : '',
    '',
    `—`,
    settings.siteName,
    resolveAlignedFromEmail(settings),
  ]
    .filter((line) => line !== undefined && line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return sendMail({
    to,
    subject,
    text,
    html,
    transactional: true,
    category: type || 'notification',
  });
}

/** Serial background queue so SMTP isn't hammered by parallel reconnects. */
const OUTBOUND_QUEUE_MAX = 100;
const outboundQueue = [];
let queueRunning = false;

function scheduleTransportIdleClose() {
  if (transportIdleTimer) clearTimeout(transportIdleTimer);
  transportIdleTimer = setTimeout(() => {
    transportIdleTimer = null;
    if (queueRunning || outboundQueue.length) return;
    closeCachedTransport();
  }, TRANSPORT_IDLE_CLOSE_MS);
  if (typeof transportIdleTimer.unref === 'function') transportIdleTimer.unref();
}

async function runOutboundQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (outboundQueue.length) {
      const job = outboundQueue.shift();
      try {
        await job();
      } catch (err) {
        console.error('[email queue]', err && err.message ? err.message : err);
      }
    }
  } finally {
    // Always clear the flag so a thrown error cannot stall the queue forever.
    queueRunning = false;
    scheduleTransportIdleClose();
  }
}

function kickOutboundQueue() {
  // setImmediate + async fn returns a floating promise — always .catch it.
  setImmediate(() => {
    runOutboundQueue().catch((err) => {
      console.error('[email queue fatal]', err && err.message ? err.message : err);
      queueRunning = false;
      scheduleTransportIdleClose();
    });
  });
}

function sendNotificationAsync(type, payload) {
  if (outboundQueue.length >= OUTBOUND_QUEUE_MAX) {
    const dropped = outboundQueue.shift();
    console.warn(
      `[email queue] full (max ${OUTBOUND_QUEUE_MAX}) — dropped oldest job` +
        (dropped && dropped._label ? `: ${dropped._label}` : '')
    );
  }
  const job = async () => {
    const result = await sendNotification(type, payload);
    if (result && result.skipped) {
      console.warn(`[email async skipped] ${type} → ${payload.to}: ${result.reason || 'not configured'}`);
    }
  };
  job._label = `${type} → ${payload && payload.to ? payload.to : '?'}`;
  outboundQueue.push(job);
  kickOutboundQueue();
}

module.exports = {
  MAIL_DOMAIN,
  brandedLayout,
  buildTransactionalHeaders,
  closeCachedTransport,
  createTransport,
  emailDomain,
  ensurePlainText,
  escapeHtml,
  extractEmailAddress,
  normalizeSmtpHost,
  plainTextToEmailHtml,
  resolveAlignedFromEmail,
  resolveEmailSettings,
  sendMail,
  sendNotification,
  sendNotificationAsync,
  transportBlockReason,
};
