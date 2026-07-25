const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { decryptSecret, getSettings } = require('./settings');
const { resolveEmailSettings } = require('./email');

function addressList(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value.value)) {
    return value.value
      .map((entry) => {
        if (entry.name && entry.address) return `${entry.name} <${entry.address}>`;
        return entry.address || entry.name || '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (value.text) return value.text;
  return String(value);
}

function firstAddress(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/<([^>]+)>/);
    return (match ? match[1] : value).trim();
  }
  if (Array.isArray(value.value) && value.value[0]) {
    return value.value[0].address || '';
  }
  return '';
}

async function resolveImapSettings() {
  const stored = await getSettings();
  const smtp = await resolveEmailSettings();
  const encryptedPass = stored.imap_pass || '';
  const decryptedPass = decryptSecret(encryptedPass);
  const port = Number(stored.imap_port || process.env.IMAP_PORT || 993);

  return {
    host: String(stored.imap_host || process.env.IMAP_HOST || smtp.host || '').trim(),
    port,
    secure: port === 993 || String(stored.imap_tls || process.env.IMAP_TLS || 'true').toLowerCase() !== 'false',
    user: String(stored.imap_user || process.env.IMAP_USER || smtp.user || '').trim(),
    pass: decryptedPass || process.env.IMAP_PASS || smtp.pass || '',
  };
}

function imapBlockReason(settings) {
  if (!settings.host) return 'IMAP host is missing. Set IMAP_HOST in .env (e.g. prime.ax).';
  if (!settings.user) return 'IMAP username is missing. Set IMAP_USER in .env.';
  if (!settings.pass) return 'IMAP password is missing. Set IMAP_PASS in .env.';
  return null;
}

async function withImap(fn) {
  const settings = await resolveImapSettings();
  const reason = imapBlockReason(settings);
  if (reason) {
    const err = new Error(reason);
    err.code = 'IMAP_NOT_CONFIGURED';
    throw err;
  }

  const client = new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.user,
      pass: settings.pass,
    },
    logger: false,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    tls: {
      servername: settings.host,
      minVersion: 'TLSv1.2',
    },
  });

  try {
    await client.connect();
    return await fn(client, settings);
  } finally {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {
        /* ignore */
      }
    }
  }
}

function summariseEnvelope(envelope = {}) {
  return {
    subject: envelope.subject || '(no subject)',
    from: addressList({ value: envelope.from || [] }) || '(unknown)',
    to: addressList({ value: envelope.to || [] }),
    date: envelope.date || null,
  };
}

async function listInbox({ limit = 40 } = {}) {
  return withImap(async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total = client.mailbox.exists || 0;
      if (!total) return { messages: [], total: 0 };

      const start = Math.max(1, total - limit + 1);
      const messages = [];

      for await (const msg of client.fetch(`${start}:*`, {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
      })) {
        const summary = summariseEnvelope(msg.envelope);
        messages.push({
          uid: msg.uid,
          subject: summary.subject,
          from: summary.from,
          to: summary.to,
          date: msg.internalDate || summary.date,
          unseen: !(msg.flags && msg.flags.has('\\Seen')),
        });
      }

      messages.sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return bTime - aTime;
      });

      return { messages, total };
    } finally {
      lock.release();
    }
  });
}

async function getMessage(uid) {
  const numericUid = Number(uid);
  if (!Number.isFinite(numericUid) || numericUid < 1) {
    const err = new Error('Invalid message id.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return withImap(async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const msg = await client.fetchOne(
        String(numericUid),
        { uid: true, envelope: true, flags: true, source: true, internalDate: true },
        { uid: true }
      );
      if (!msg || !msg.source) {
        const err = new Error('Message not found.');
        err.code = 'NOT_FOUND';
        throw err;
      }

      const parsed = await simpleParser(msg.source);
      const text =
        (parsed.text && parsed.text.trim()) ||
        String(parsed.html || '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

      if (!(msg.flags && msg.flags.has('\\Seen'))) {
        try {
          await client.messageFlagsAdd(numericUid, ['\\Seen'], { uid: true });
        } catch {
          /* non-fatal */
        }
      }

      return {
        uid: msg.uid,
        subject: parsed.subject || msg.envelope?.subject || '(no subject)',
        from: addressList(parsed.from) || summariseEnvelope(msg.envelope).from,
        fromAddress: firstAddress(parsed.from),
        to: addressList(parsed.to) || summariseEnvelope(msg.envelope).to,
        cc: addressList(parsed.cc),
        date: parsed.date || msg.internalDate || null,
        messageId: parsed.messageId || '',
        inReplyTo: parsed.inReplyTo || '',
        references: parsed.references
          ? Array.isArray(parsed.references)
            ? parsed.references.join(' ')
            : String(parsed.references)
          : '',
        text,
        attachments: (parsed.attachments || []).map((file) => ({
          filename: file.filename || 'attachment',
          size: file.size || 0,
          contentType: file.contentType || '',
        })),
      };
    } finally {
      lock.release();
    }
  });
}

function replySubject(subject) {
  const value = String(subject || '').trim() || '(no subject)';
  return /^re:/i.test(value) ? value : `Re: ${value}`;
}

async function sendMailboxMail({ to, cc, subject, text, inReplyTo, references }) {
  const { createTransport } = require('./email');
  const { transport, settings, reason } = await createTransport();
  if (!transport) return { skipped: true, reason };

  const html = `<div style="white-space:pre-wrap;font-family:Arial,sans-serif;color:#1a2b40">${String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</div>`;

  await transport.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    replyTo: settings.replyTo || undefined,
    to,
    cc: cc || undefined,
    subject,
    text,
    html,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
  });

  return { sent: true };
}

module.exports = {
  getMessage,
  imapBlockReason,
  listInbox,
  replySubject,
  resolveImapSettings,
  sendMailboxMail,
};
