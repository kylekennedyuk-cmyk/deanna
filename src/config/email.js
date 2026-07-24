const nodemailer = require('nodemailer');

function createTransport() {
  if (!process.env.SMTP_HOST) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });
}

async function sendMail({ to, subject, text, html }) {
  const transport = createTransport();
  if (!transport) {
    console.log(`[email skipped] To: ${to} | ${subject}`);
    return { skipped: true };
  }

  return transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SUPPORT_EMAIL,
    to,
    subject,
    text,
    html,
  });
}

module.exports = { sendMail };
