const { prisma, withSqliteRetry } = require('../config/database');

const EMPTY_COUNTS = Object.freeze({
  messages: 0,
  plans: 0,
  mailbox: 0,
  changeRequests: 0,
  total: 0,
});

function emptyBadgeCounts() {
  return { ...EMPTY_COUNTS };
}

function isStaff(user) {
  return user && (user.role === 'agent' || user.role === 'admin');
}

/** Throttle noisy badge warnings so schema drift doesn't flood Passenger logs. */
let lastBadgeWarnAt = 0;
const BADGE_WARN_EVERY_MS = 60 * 1000;

function warnBadge(err) {
  const now = Date.now();
  if (now - lastBadgeWarnAt < BADGE_WARN_EVERY_MS) return;
  lastBadgeWarnAt = now;
  const code = err && err.code ? ` [${err.code}]` : '';
  console.warn(
    `[notifications] badge counts failed${code}:`,
    err && err.message ? err.message : err,
    '| If this mentions a missing table/column, run npm run update (prisma db push) on the server.'
  );
}

/**
 * Plans this user may see plan messages for.
 * Staff: all plans. Customers: their own plans only.
 */
function accessiblePlanWhere(user) {
  if (isStaff(user)) return {};
  return { customerId: user.id };
}

/**
 * SQLite does not support createMany({ skipDuplicates }), so filter out reads
 * that already exist and tolerate the unique-constraint race on retry.
 */
async function createMessageReads(userId, messageIds) {
  if (!messageIds.length) return 0;

  const existing = await prisma.messageRead.findMany({
    where: { userId, messageId: { in: messageIds } },
    select: { messageId: true },
  });
  const alreadyRead = new Set(existing.map((row) => row.messageId));
  const fresh = messageIds.filter((id) => !alreadyRead.has(id));
  if (!fresh.length) return 0;

  const readAt = new Date();
  try {
    await withSqliteRetry(() =>
      prisma.messageRead.createMany({
        data: fresh.map((messageId) => ({ messageId, userId, readAt })),
      })
    );
  } catch (err) {
    if (err.code !== 'P2002') throw err;
  }
  return fresh.length;
}

/**
 * One-time per user: mark every currently accessible incoming message as read,
 * then flip messageReadsInitialized. New messages after this remain unread until opened.
 */
async function ensureMessageReadsInitialized(user) {
  if (!user || user.messageReadsInitialized) return;

  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, messageReadsInitialized: true },
  });
  if (!fresh || fresh.messageReadsInitialized) {
    if (fresh) user.messageReadsInitialized = true;
    return;
  }

  const plans = await prisma.holidayPlan.findMany({
    where: accessiblePlanWhere(user),
    select: { id: true },
  });
  const planIds = plans.map((p) => p.id);

  if (planIds.length) {
    const incoming = await prisma.message.findMany({
      where: {
        planId: { in: planIds },
        senderId: { not: user.id },
      },
      select: { id: true },
    });

    await createMessageReads(
      user.id,
      incoming.map((m) => m.id)
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { messageReadsInitialized: true },
  });
  user.messageReadsInitialized = true;
}

/**
 * Mark incoming (not self-sent) messages on a plan as read for this user.
 */
async function markPlanMessagesRead(user, planId) {
  if (!user || !planId) return 0;

  await ensureMessageReadsInitialized(user);

  const plan = await prisma.holidayPlan.findFirst({
    where: {
      id: Number(planId),
      ...accessiblePlanWhere(user),
    },
    select: { id: true },
  });
  if (!plan) return 0;

  const unread = await prisma.message.findMany({
    where: {
      planId: plan.id,
      senderId: { not: user.id },
      reads: { none: { userId: user.id } },
    },
    select: { id: true },
  });

  if (!unread.length) return 0;

  return createMessageReads(
    user.id,
    unread.map((m) => m.id)
  );
}

async function countUnreadPlanMessages(user) {
  await ensureMessageReadsInitialized(user);

  return prisma.message.count({
    where: {
      senderId: { not: user.id },
      plan: accessiblePlanWhere(user),
      reads: { none: { userId: user.id } },
    },
  });
}

async function countActionPlans(user) {
  if (isStaff(user)) {
    // New requests + customer replies waiting on the agent.
    return prisma.holidayPlan.count({
      where: { status: { in: ['new', 'awaiting_agent'] } },
    });
  }

  return prisma.holidayPlan.count({
    where: {
      customerId: user.id,
      status: { in: ['awaiting_client', 'sent'] },
    },
  });
}

/**
 * Mailbox badge for staff.
 * Default: peek the in-process cache only (never opens IMAP). Cold cache → 0.
 * Pass refresh:true only from /agent/mailbox routes so browsing the dashboard
 * cannot reconnect-storm the mail server and destabilise Passenger.
 */
async function countMailboxUnseen(user, { refresh = false } = {}) {
  if (!isStaff(user)) return 0;
  try {
    const { getInboxUnseenCount, peekInboxUnseenCount } = require('../config/mailbox');
    if (!refresh) return peekInboxUnseenCount();
    return await getInboxUnseenCount({ force: true });
  } catch (err) {
    console.warn('[notifications] mailbox unseen failed:', err && err.message ? err.message : err);
    return 0;
  }
}

/** Open + in-progress site change requests — admin nav badge only. */
async function countOpenChangeRequests(user) {
  if (!user || user.role !== 'admin') return 0;
  return prisma.changeRequest.count({
    where: { status: { in: ['open', 'in_progress'] } },
  });
}

async function softCount(label, fn) {
  try {
    return await fn();
  } catch (err) {
    warnBadge(err);
    return 0;
  }
}

/**
 * Role-scoped badge counts for nav / header.
 * Fail-soft: never throws to the request pipeline — including Prisma schema drift
 * (missing MessageRead / ChangeRequest / booking columns). A nav badge must never
 * break page rendering or crash the app.
 *
 * @param {object} user
 * @param {{ refreshMailbox?: boolean }} [options]
 *   refreshMailbox — open IMAP STATUS (only for /agent/mailbox). Default false.
 */
async function getBadgeCounts(user, options = {}) {
  if (!user) return emptyBadgeCounts();

  const refreshMailbox = Boolean(options.refreshMailbox);

  try {
    const [messages, plans, mailbox, changeRequests] = await Promise.all([
      softCount('messages', () => countUnreadPlanMessages(user)),
      softCount('plans', () => countActionPlans(user)),
      softCount('mailbox', () => countMailboxUnseen(user, { refresh: refreshMailbox })),
      softCount('changeRequests', () => countOpenChangeRequests(user)),
    ]);

    const total =
      messages + plans + (isStaff(user) ? mailbox : 0) + (user.role === 'admin' ? changeRequests : 0);

    return {
      messages: messages || 0,
      plans: plans || 0,
      mailbox: mailbox || 0,
      changeRequests: changeRequests || 0,
      total: total || 0,
    };
  } catch (err) {
    warnBadge(err);
    return emptyBadgeCounts();
  }
}

/**
 * Refresh res.locals.badgeCounts after mark-read / mailbox open.
 * Pass { refreshMailbox: true } on mailbox routes so the badge updates from IMAP.
 */
async function refreshBadgeCounts(res, user, options = {}) {
  try {
    const counts = await getBadgeCounts(user, options);
    if (res && res.locals) res.locals.badgeCounts = counts;
    return counts;
  } catch (err) {
    warnBadge(err);
    const counts = emptyBadgeCounts();
    if (res && res.locals) res.locals.badgeCounts = counts;
    return counts;
  }
}

module.exports = {
  EMPTY_COUNTS,
  emptyBadgeCounts,
  ensureMessageReadsInitialized,
  getBadgeCounts,
  markPlanMessagesRead,
  refreshBadgeCounts,
};
