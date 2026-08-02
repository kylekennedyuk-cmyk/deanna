const nodemailer = require('nodemailer');
const { decryptSecret, getSettings } = require('./settings');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  if (!settings.fromEmail) {
    return 'From email is missing. Use the same mailbox address you authenticate with.';
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
  return nodemailer.createTransport({
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
  });
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

async function sendMailOnce(transport, settings, payload) {
  return transport.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    replyTo: payload.replyTo || settings.replyTo || undefined,
    to: payload.to,
    cc: payload.cc || undefined,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    inReplyTo: payload.inReplyTo || undefined,
    references: payload.references || undefined,
    attachments: payload.attachments && payload.attachments.length ? payload.attachments : undefined,
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
  const logo = logoSrc
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px"><tr><td align="center" style="text-align:center">
        <img src="${logoSrc}" alt="${escapeHtml(settings.siteName)}" width="200" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;width:auto;max-width:200px;height:auto;max-height:72px" />
      </td></tr></table>`
    : `<div style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#1a2b40;text-align:center;margin-bottom:20px">${escapeHtml(settings.siteName)}</div>`;

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
      <div style="padding:36px 36px 20px;text-align:center">${logo}</div>
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
  const safeValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, escapeHtml(value)])
  );

  const subject = interpolate(subjectTemplate, values);
  const heading = interpolate(headingTemplate, values);
  const intro = interpolate(introTemplate, values);
  const bodyHtml = `<div style="white-space:pre-wrap;background:#f3f6fa;border-radius:14px;padding:18px">${escapeHtml(body)}</div>`;
  const html = brandedLayout(settings, {
    heading,
    intro,
    bodyHtml,
    buttonLabel,
    buttonUrl,
  });
  const text = `${interpolate(headingTemplate, safeValues)}\n\n${interpolate(introTemplate, safeValues)}\n\n${body}\n\n${buttonUrl || ''}`;
  return sendMail({ to, subject, text, html });
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
  brandedLayout,
  closeCachedTransport,
  createTransport,
  escapeHtml,
  normalizeSmtpHost,
  resolveEmailSettings,
  sendMail,
  sendNotification,
  sendNotificationAsync,
  transportBlockReason,
};
