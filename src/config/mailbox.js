const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { decryptSecret, getSettings } = require('./settings');
const { brandedLayout, escapeHtml, resolveEmailSettings, sendMail } = require('./email');

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

function textFromParsed(parsed) {
  return (
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
      .trim()
  );
}

async function resolveImapSettings() {
  const stored = await getSettings();
  const smtp = await resolveEmailSettings();
  const encryptedPass = stored.imap_pass || '';
  const decryptedPass = decryptSecret(encryptedPass);
  const port = Number(stored.imap_port || process.env.IMAP_PORT || 993);
  const { normalizeSmtpHost } = require('./email');

  return {
    host: normalizeSmtpHost(stored.imap_host || process.env.IMAP_HOST || smtp.host || ''),
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

const IMAP_OP_TIMEOUT_MS = 45000;

/** Global semaphore: at most one IMAP connection at a time (memory / FD pressure). */
let imapActive = null;
const imapWaitQueue = [];

function acquireImapSlot() {
  if (!imapActive) {
    let release;
    imapActive = new Promise((resolve) => {
      release = resolve;
    });
    return Promise.resolve(release);
  }
  return new Promise((resolve) => {
    imapWaitQueue.push(resolve);
  }).then((release) => release);
}

function releaseImapSlot(release) {
  try {
    if (typeof release === 'function') release();
  } catch {
    /* ignore */
  }
  const next = imapWaitQueue.shift();
  if (next) {
    let nextRelease;
    imapActive = new Promise((resolve) => {
      nextRelease = resolve;
    });
    next(nextRelease);
  } else {
    imapActive = null;
  }
}

function forceCloseImapClient(client) {
  try {
    client.close();
  } catch {
    /* ignore */
  }
  try {
    if (client.socket && typeof client.socket.destroy === 'function') {
      client.socket.destroy();
    }
  } catch {
    /* ignore */
  }
}

/**
 * ImapFlow emits 'error' asynchronously. Without a listener, Node treats that
 * as an uncaughtException and kills the process — a strong match for
 * intermittent Passenger downtime every few hours when staff hit the mailbox
 * or badge middleware probes INBOX STATUS.
 *
 * Serialised to max 1 concurrent op. On timeout, force-close the socket.
 * Global badge middleware must never call this — use peekInboxUnseenCount only.
 */
async function withImap(fn) {
  const settings = await resolveImapSettings();
  const reason = imapBlockReason(settings);
  if (reason) {
    const err = new Error(reason);
    err.code = 'IMAP_NOT_CONFIGURED';
    throw err;
  }

  const release = await acquireImapSlot();
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

  client.on('error', (err) => {
    console.warn('[imap] client error:', err && err.message ? err.message : err);
  });

  let timer;
  let timedOut = false;
  try {
    const work = (async () => {
      await client.connect();
      return fn(client, settings);
    })();

    // If Promise.race settles on timeout, `work` may still reject later.
    // Attach a handler so that late rejection cannot become unhandledRejection.
    work.catch((err) => {
      if (timedOut) {
        console.warn(
          '[imap] late failure after timeout (ignored):',
          err && err.message ? err.message : err
        );
      }
    });

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        console.warn(`[imap] timeout after ${IMAP_OP_TIMEOUT_MS}ms — force closing client`);
        forceCloseImapClient(client);
        const err = new Error(`IMAP operation timed out after ${IMAP_OP_TIMEOUT_MS}ms`);
        err.code = 'IMAP_TIMEOUT';
        reject(err);
      }, IMAP_OP_TIMEOUT_MS);
      if (typeof timer.unref === 'function') timer.unref();
    });

    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    try {
      if (!timedOut) {
        await client.logout();
      } else {
        forceCloseImapClient(client);
      }
    } catch {
      forceCloseImapClient(client);
    }
    releaseImapSlot(release);
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

function classifyFolder(box) {
  const path = box.path || '';
  const name = String(box.name || path.split(/[/.\[]/).pop() || path).trim();
  const special = String(box.specialUse || '').toLowerCase();
  const lower = `${path} ${name}`.toLowerCase();

  if (special === '\\inbox' || path.toUpperCase() === 'INBOX') {
    return { key: 'inbox', label: 'Inbox', order: 1 };
  }
  if (special === '\\sent' || /\bsent\b/.test(lower) || lower.includes('outbox')) {
    return { key: 'sent', label: 'Sent', order: 2 };
  }
  if (special === '\\drafts' || /\bdraft/.test(lower)) {
    return { key: 'drafts', label: 'Drafts', order: 3 };
  }
  if (special === '\\trash' || /\b(trash|deleted|bin)\b/.test(lower)) {
    return { key: 'trash', label: 'Deleted', order: 4 };
  }
  if (special === '\\junk' || /\b(junk|spam)\b/.test(lower)) {
    return { key: 'junk', label: 'Junk', order: 5 };
  }
  if (special === '\\archive' || /\barchive\b/.test(lower)) {
    return { key: 'archive', label: 'Archive', order: 6 };
  }
  return { key: 'other', label: name || path, order: 50 };
}

function mapListedFolders(listed) {
  const folders = listed
    .filter((box) => box && box.path && !box.flags?.has('\\Noselect'))
    .map((box) => {
      const kind = classifyFolder(box);
      return {
        path: box.path,
        name: box.name || box.path,
        label: kind.label,
        key: kind.key,
        order: kind.order,
        specialUse: box.specialUse || '',
      };
    });

  folders.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

  const preferred = [];
  const seenKeys = new Set();
  for (const folder of folders) {
    if (folder.key !== 'other' && seenKeys.has(folder.key)) continue;
    if (folder.key !== 'other') seenKeys.add(folder.key);
    preferred.push(folder);
  }

  if (!preferred.some((f) => f.key === 'inbox')) {
    preferred.unshift({
      path: 'INBOX',
      name: 'INBOX',
      label: 'Inbox',
      key: 'inbox',
      order: 1,
      specialUse: '\\Inbox',
    });
  }

  return preferred;
}

async function listFolders() {
  return withImap(async (client) => mapListedFolders(await client.list()));
}

/** Keep badge warm for 10 minutes — never hit IMAP from every staff page load. */
const UNSEEN_CACHE_TTL_MS = 10 * 60 * 1000;
/** On IMAP errors, back off briefly so we do not reconnect-storm. */
const UNSEEN_ERROR_TTL_MS = 2 * 60 * 1000;
/** Soft bound: only one cached value + one inflight promise (no unbounded growth). */
let unseenCache = { value: null, expiresAt: 0, inflight: null };

function invalidateInboxUnseenCache() {
  unseenCache = { value: null, expiresAt: 0, inflight: null };
}

/** Write the in-process unseen cache (used after mailbox list/open STATUS). */
function setInboxUnseenCache(count, ttlMs = UNSEEN_CACHE_TTL_MS) {
  unseenCache = {
    value: Math.max(0, Number(count) || 0),
    expiresAt: Date.now() + ttlMs,
    inflight: null,
  };
  return unseenCache.value;
}

/**
 * Synchronous peek — never opens IMAP.
 * Returns the cached count when warm, otherwise 0 (badge stays quiet until
 * /agent/mailbox refreshes the cache).
 */
function peekInboxUnseenCount() {
  if (unseenCache.value !== null && Date.now() < unseenCache.expiresAt) {
    return unseenCache.value;
  }
  return 0;
}

/**
 * Efficient INBOX unseen count via IMAP STATUS (not a full message list).
 * Long in-process cache; misconfiguration / IMAP errors return 0 (cached briefly).
 * The returned promise never rejects — callers must not need .catch().
 * Prefer peekInboxUnseenCount() from global badge middleware.
 */
async function getInboxUnseenCount({ force = false } = {}) {
  const now = Date.now();
  if (!force && unseenCache.value !== null && now < unseenCache.expiresAt) {
    return unseenCache.value;
  }
  if (!force && unseenCache.inflight) {
    return unseenCache.inflight;
  }

  const fetchPromise = (async () => {
    try {
      const count = await withImap(async (client) => {
        const status = await client.status('INBOX', { unseen: true, messages: true });
        return Number(status?.unseen || 0);
      });
      return setInboxUnseenCache(count, UNSEEN_CACHE_TTL_MS);
    } catch (err) {
      // Fail-soft: never break pages; cache zero briefly to avoid reconnect storms.
      console.warn('[mailbox] unseen count failed:', err && err.message ? err.message : err);
      return setInboxUnseenCache(0, UNSEEN_ERROR_TTL_MS);
    }
  })();

  // Extra belt: if the async IIFE ever rejects despite the try/catch, swallow it.
  unseenCache.inflight = fetchPromise.catch((err) => {
    console.warn('[mailbox] unseen inflight rejected:', err && err.message ? err.message : err);
    return setInboxUnseenCache(0, UNSEEN_ERROR_TTL_MS);
  });
  return unseenCache.inflight;
}

async function resolveFolderMap() {
  const folders = await listFolders();
  const byKey = Object.fromEntries(folders.filter((f) => f.key !== 'other').map((f) => [f.key, f.path]));
  return { folders, byKey };
}

function normalizeFolder(folder, folders = []) {
  const requested = String(folder || 'INBOX').trim() || 'INBOX';
  if (folders.some((f) => f.path === requested)) return requested;
  const byLabel = folders.find((f) => f.label.toLowerCase() === requested.toLowerCase());
  if (byLabel) return byLabel.path;
  const byKey = folders.find((f) => f.key === requested.toLowerCase());
  if (byKey) return byKey.path;
  return requested;
}

async function listMessages(folder = 'INBOX', { limit = 50 } = {}) {
  return withImap(async (client) => {
    const folders = mapListedFolders(await client.list());
    const path = normalizeFolder(folder, folders);
    const lock = await client.getMailboxLock(path);
    try {
      const total = client.mailbox.exists || 0;
      if (!total) {
        // Warm badge cache from real STATUS when browsing inbox (same connection).
        if (path.toUpperCase() === 'INBOX') {
          try {
            const status = await client.status('INBOX', { unseen: true });
            setInboxUnseenCache(Number(status?.unseen || 0));
          } catch {
            setInboxUnseenCache(0, UNSEEN_ERROR_TTL_MS);
          }
        }
        return { messages: [], total: 0, folder: path, folders };
      }

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
          draft: Boolean(msg.flags && msg.flags.has('\\Draft')),
        });
      }

      messages.sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return bTime - aTime;
      });

      // Refresh nav badge from STATUS on the same connection (no second login).
      if (path.toUpperCase() === 'INBOX') {
        try {
          const status = await client.status('INBOX', { unseen: true });
          setInboxUnseenCache(Number(status?.unseen || 0));
        } catch {
          /* keep previous cache */
        }
      }

      return { messages, total, folder: path, folders };
    } finally {
      lock.release();
    }
  });
}

async function getMessage(folder, uid) {
  const numericUid = Number(uid);
  if (!Number.isFinite(numericUid) || numericUid < 1) {
    const err = new Error('Invalid message id.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return withImap(async (client) => {
    const folders = await listFoldersViaClient(client);
    const path = normalizeFolder(folder, folders);
    const lock = await client.getMailboxLock(path);
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
      const text = textFromParsed(parsed);
      const folderMeta = folders.find((f) => f.path === path);

      if (!(msg.flags && msg.flags.has('\\Seen'))) {
        try {
          await client.messageFlagsAdd(numericUid, ['\\Seen'], { uid: true });
          if ((folderMeta?.key || '') === 'inbox' || path.toUpperCase() === 'INBOX') {
            try {
              const status = await client.status('INBOX', { unseen: true });
              setInboxUnseenCache(Number(status?.unseen || 0));
            } catch {
              invalidateInboxUnseenCache();
            }
          }
        } catch {
          /* non-fatal */
        }
      }

      return {
        uid: msg.uid,
        folder: path,
        folderKey: folderMeta?.key || 'other',
        folderLabel: folderMeta?.label || path,
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
        draft: Boolean(msg.flags && msg.flags.has('\\Draft')),
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

async function listFoldersViaClient(client) {
  return mapListedFolders(await client.list());
}

async function findFolderPath(client, key) {
  const folders = await listFoldersViaClient(client);
  const match = folders.find((f) => f.key === key);
  return match ? match.path : null;
}

async function moveMessage(folder, uid, targetKeyOrPath) {
  const numericUid = Number(uid);
  if (!Number.isFinite(numericUid) || numericUid < 1) {
    throw new Error('Invalid message id.');
  }

  return withImap(async (client) => {
    const folders = await listFoldersViaClient(client);
    const source = normalizeFolder(folder, folders);
    let destination = targetKeyOrPath;
    const byKey = folders.find((f) => f.key === String(targetKeyOrPath || '').toLowerCase());
    if (byKey) destination = byKey.path;
    destination = normalizeFolder(destination, folders);

    if (source === destination) return { moved: false, folder: source };

    const lock = await client.getMailboxLock(source);
    try {
      const result = await client.messageMove(String(numericUid), destination, { uid: true });
      if (!result) throw new Error('Could not move message.');
      return { moved: true, folder: destination };
    } finally {
      lock.release();
    }
  });
}

async function deleteMessage(folder, uid) {
  const numericUid = Number(uid);
  if (!Number.isFinite(numericUid) || numericUid < 1) {
    throw new Error('Invalid message id.');
  }

  return withImap(async (client) => {
    const folders = await listFoldersViaClient(client);
    const source = normalizeFolder(folder, folders);
    const sourceMeta = folders.find((f) => f.path === source);
    const trashPath = (await findFolderPath(client, 'trash')) || 'Trash';

    const lock = await client.getMailboxLock(source);
    try {
      if (sourceMeta?.key === 'trash' || source === trashPath) {
        await client.messageDelete(String(numericUid), { uid: true });
        return { deleted: true, permanent: true, folder: source };
      }

      const result = await client.messageMove(String(numericUid), trashPath, { uid: true });
      if (!result) {
        // Fallback: flag deleted + expunge if move fails
        await client.messageFlagsAdd(numericUid, ['\\Deleted'], { uid: true });
        await client.expunge();
        return { deleted: true, permanent: true, folder: source };
      }
      return { deleted: true, permanent: false, folder: trashPath };
    } finally {
      lock.release();
    }
  });
}

function brandedOutgoingHtml(settings, { subject, bodyText }) {
  const paragraphs = String(bodyText || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#1a2b40;white-space:pre-wrap">${escapeHtml(block)}</p>`
    )
    .join('');

  const bodyHtml = `
    ${paragraphs || `<p style="margin:0;color:#3d5b79"> </p>`}
    <p style="margin:28px 0 0;font-size:15px;line-height:1.6;color:#3d5b79">
      Warm regards,<br />
      <strong style="color:#1a2b40">${escapeHtml(settings.fromName || settings.siteName)}</strong><br />
      <span style="color:#5a738c">${escapeHtml(settings.siteName)}</span>
      ${settings.fromEmail ? `<br /><a href="mailto:${escapeHtml(settings.fromEmail)}" style="color:#1a2b40;text-decoration:none">${escapeHtml(settings.fromEmail)}</a>` : ''}
    </p>
  `;

  return brandedLayout(settings, {
    heading: subject || 'Message from Destinations With Deanna',
    intro: 'A personal note from your Disneyland Paris specialist.',
    bodyHtml,
  });
}

function buildMime({ from, to, cc, subject, text, html, inReplyTo, references, draft = false }) {
  const boundary = `dwd_${Date.now().toString(16)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `Date: ${new Date().toUTCString()}`,
    draft ? 'X-Draft: yes' : null,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
  ]
    .filter(Boolean)
    .join('\r\n');

  return `${headers}\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${text}\r\n\r\n--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${html}\r\n\r\n--${boundary}--\r\n`;
}

async function appendToFolder(folderKey, raw, flags = []) {
  return withImap(async (client) => {
    const path = (await findFolderPath(client, folderKey)) || (folderKey === 'sent' ? 'Sent' : folderKey === 'drafts' ? 'Drafts' : null);
    if (!path) return { appended: false };
    await client.append(path, raw, flags);
    return { appended: true, folder: path };
  });
}

function replySubject(subject) {
  const value = String(subject || '').trim() || '(no subject)';
  return /^re:/i.test(value) ? value : `Re: ${value}`;
}

async function sendMailboxMail({ to, cc, subject, text, inReplyTo, references }) {
  const settings = await resolveEmailSettings();
  const html = brandedOutgoingHtml(settings, { subject, bodyText: text });
  const from = `"${settings.fromName}" <${settings.fromEmail}>`;

  const result = await sendMail({
    to,
    cc: cc || undefined,
    subject,
    text: `${text}\n\n—\n${settings.fromName}\n${settings.siteName}\n${settings.fromEmail || ''}`,
    html,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
  });
  if (result && result.skipped) return { skipped: true, reason: result.reason };

  try {
    const raw = buildMime({
      from,
      to,
      cc,
      subject,
      text,
      html,
      inReplyTo,
      references,
    });
    await appendToFolder('sent', raw, ['\\Seen']);
  } catch (err) {
    console.warn('[mailbox] could not append to Sent:', err.message);
  }

  return { sent: true };
}

async function saveDraft({ to, cc, subject, text }) {
  const settings = await resolveEmailSettings();
  const html = brandedOutgoingHtml(settings, { subject: subject || 'Draft', bodyText: text || '' });
  const from = `"${settings.fromName}" <${settings.fromEmail || settings.user || 'draft@localhost'}>`;
  const raw = buildMime({
    from,
    to: to || settings.fromEmail || 'draft@localhost',
    cc,
    subject: subject || '(no subject)',
    text: text || '',
    html,
    draft: true,
  });

  const result = await appendToFolder('drafts', raw, ['\\Draft', '\\Seen']);
  if (!result.appended) {
    throw new Error('Could not find a Drafts folder on this mailbox.');
  }
  return result;
}

/** Back-compat helpers used by older routes */
async function listInbox(options) {
  return listMessages('INBOX', options);
}

module.exports = {
  appendToFolder,
  brandedOutgoingHtml,
  deleteMessage,
  getInboxUnseenCount,
  getMessage,
  imapBlockReason,
  invalidateInboxUnseenCache,
  listFolders,
  listInbox,
  listMessages,
  moveMessage,
  peekInboxUnseenCount,
  replySubject,
  resolveFolderMap,
  resolveImapSettings,
  saveDraft,
  sendMailboxMail,
  setInboxUnseenCache,
};
