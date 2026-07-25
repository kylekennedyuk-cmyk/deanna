/**
 * Verifies SMTP + IMAP using env/DB settings without printing secrets.
 * Usage: node scripts/verify-mail.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createTransport } = require('../src/config/email');
const { listInbox, resolveImapSettings } = require('../src/config/mailbox');
const { prisma } = require('../src/config/database');

async function main() {
  const { transport, settings, reason } = await createTransport();
  if (!transport) {
    throw new Error(`SMTP not ready: ${reason}`);
  }
  console.log(`SMTP ok config ${settings.host}:${settings.port} secure=${settings.secure} user=${settings.user}`);
  await transport.verify();
  console.log('SMTP verify passed');

  const imap = await resolveImapSettings();
  console.log(`IMAP ok config ${imap.host}:${imap.port} secure=${imap.secure} user=${imap.user}`);
  const messages = await listInbox({ limit: 5 });
  console.log(`IMAP inbox readable (${(messages.messages || []).length} recent message(s) fetched)`);
}

main()
  .catch((err) => {
    console.error('Mail verify failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
