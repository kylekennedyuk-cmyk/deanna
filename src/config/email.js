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
    host: String(stored.smtp_host || process.env.SMTP_HOST || '').trim(),
    port,
    secure,
    requireTLS: port === 587 && !secure,
    user: String(stored.smtp_user || process.env.SMTP_USER || '').trim(),
    pass: decryptedPass || process.env.SMTP_PASS || '',
    passBroken,
    fromName: stored.smtp_from_name || 'Destinations With Deanna',
    fromEmail: String(
      stored.smtp_from_email ||
        process.env.SMTP_FROM_EMAIL ||
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

async function createTransport() {
  const settings = await resolveEmailSettings();
  const reason = transportBlockReason(settings);
  if (reason) return { transport: null, settings, reason };

  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: settings.requireTLS,
    auth: {
      user: settings.user,
      pass: settings.pass,
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    tls: {
      servername: settings.host,
      minVersion: 'TLSv1.2',
    },
  });
  return { transport, settings, reason: null };
}

async function sendMail({ to, subject, text, html }) {
  const { transport, settings, reason } = await createTransport();
  if (!transport) {
    console.log(`[email skipped] To: ${to} | ${subject} | ${reason || 'not configured'}`);
    return { skipped: true, reason };
  }

  return transport.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    replyTo: settings.replyTo || undefined,
    to,
    subject,
    text,
    html,
  });
}

function brandedLayout(settings, { heading, intro, bodyHtml, buttonLabel, buttonUrl }) {
  const logo = settings.logoUrl
    ? `<img src="${escapeHtml(settings.logoUrl.startsWith('http') ? settings.logoUrl : `${settings.appUrl}${settings.logoUrl}`)}" alt="${escapeHtml(settings.siteName)}" style="max-height:64px;max-width:220px;margin:0 auto 20px;display:block">`
    : `<div style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#1a2b40;text-align:center;margin-bottom:20px">${escapeHtml(settings.siteName)}</div>`;

  const button =
    buttonLabel && buttonUrl
      ? `<p style="margin:28px 0"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:${escapeHtml(settings.primaryColour)};color:#fff;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:700">${escapeHtml(buttonLabel)}</a></p>`
      : '';

  return `<!doctype html>
<html><body style="margin:0;background:#fbf8f3;font-family:Arial,sans-serif;color:#1a2b40">
  <div style="padding:32px 16px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 35px rgba(15,26,40,.08)">
      <div style="padding:36px 36px 20px">${logo}</div>
      <div style="padding:0 36px 36px">
        <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.2;margin:0 0 16px;color:#1a2b40">${escapeHtml(heading)}</h1>
        <p style="font-size:16px;line-height:1.65;color:#3d5b79;margin:0 0 20px">${escapeHtml(intro)}</p>
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

module.exports = {
  brandedLayout,
  createTransport,
  resolveEmailSettings,
  sendMail,
  sendNotification,
  transportBlockReason,
};
