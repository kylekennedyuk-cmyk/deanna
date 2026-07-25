/**
 * Upserts SMTP settings from .env into the local database (password encrypted).
 * Does not print secrets. Safe to run locally after filling .env.
 *
 * Usage: node scripts/apply-mail-settings.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { encryptSecret, setSettings } = require('../src/config/settings');
const { prisma } = require('../src/config/database');

async function main() {
  const host = process.env.SMTP_HOST || '';
  const port = process.env.SMTP_PORT || '465';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const fromEmail = process.env.SMTP_FROM_EMAIL || user;
  const fromName = process.env.SMTP_FROM_NAME || 'Destinations With Deanna';
  const secure =
    String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === '465'
      ? 'true'
      : 'false';

  if (!host || !user || !pass) {
    throw new Error('SMTP_HOST, SMTP_USER and SMTP_PASS must be set in .env');
  }

  const values = {
    email_notifications_enabled: 'true',
    smtp_host: host,
    smtp_port: String(port),
    smtp_secure: secure,
    smtp_user: user,
    smtp_pass: encryptSecret(pass),
    smtp_from_name: fromName,
    smtp_from_email: fromEmail,
    smtp_reply_to: process.env.SUPPORT_EMAIL || fromEmail,
    imap_host: process.env.IMAP_HOST || host,
    imap_port: String(process.env.IMAP_PORT || '993'),
    imap_user: process.env.IMAP_USER || user,
    imap_tls: String(process.env.IMAP_TLS || 'true').toLowerCase() === 'false' ? 'false' : 'true',
  };

  const imapPass = process.env.IMAP_PASS || pass;
  if (imapPass) {
    values.imap_pass = encryptSecret(imapPass);
  }

  await setSettings(values);
  console.log('Mail settings saved (password encrypted).');
  console.log(`SMTP ${host}:${port} as ${user}; IMAP ${values.imap_host}:${values.imap_port}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
