/**
 * Verifies SMTP + IMAP using env/DB settings without printing secrets.
 * Usage: node scripts/verify-mail.js
 *
 * For DNS-only SPF/DKIM/DMARC checks (no secrets): npm run mail:verify-dns
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createTransport, resolveAlignedFromEmail } = require('../src/config/email');
const { listInbox, resolveImapSettings } = require('../src/config/mailbox');
const { prisma } = require('../src/config/database');

async function main() {
  const { transport, settings, reason } = await createTransport();
  if (!transport) {
    throw new Error(`SMTP not ready: ${reason}`);
  }
  const fromEmail = resolveAlignedFromEmail(settings);
  console.log(
    `SMTP ok config ${settings.host}:${settings.port} secure=${settings.secure} user=${settings.user} from=${fromEmail}`
  );
  if (settings.fromEmail && settings.fromEmail.toLowerCase() !== fromEmail.toLowerCase()) {
    console.warn(
      `Note: configured From ${settings.fromEmail} was realigned to ${fromEmail} for SPF/DMARC`
    );
  }
  await transport.verify();
  console.log('SMTP verify passed');
  console.log('Tip: run npm run mail:verify-dns to check public SPF/DKIM/DMARC records');

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
