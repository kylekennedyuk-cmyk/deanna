const { prisma } = require('../config/database');

const EMPTY_COUNTS = Object.freeze({
  messages: 0,
  plans: 0,
  mailbox: 0,
  total: 0,
});

function emptyBadgeCounts() {
  return { ...EMPTY_COUNTS };
}

function isStaff(user) {
  return user && (user.role === 'agent' || user.role === 'admin');
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

    if (incoming.length) {
      await prisma.messageRead.createMany({
        data: incoming.map((m) => ({
          messageId: m.id,
          userId: user.id,
          readAt: new Date(),
        })),
        skipDuplicates: true,
      });
    }
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

  await prisma.messageRead.createMany({
    data: unread.map((m) => ({
      messageId: m.id,
      userId: user.id,
      readAt: new Date(),
    })),
    skipDuplicates: true,
  });

  return unread.length;
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
    return prisma.holidayPlan.count({
      where: { status: { in: ['new', 'in_progress'] } },
    });
  }

  return prisma.holidayPlan.count({
    where: {
      customerId: user.id,
      status: 'sent',
    },
  });
}

async function countMailboxUnseen(user) {
  if (!isStaff(user)) return 0;
  try {
    const { getInboxUnseenCount } = require('../config/mailbox');
    return await getInboxUnseenCount();
  } catch (err) {
    console.warn('[notifications] mailbox unseen failed:', err.message || err);
    return 0;
  }
}

/**
 * Role-scoped badge counts for nav / header.
 * Fail-soft: never throws to the request pipeline.
 */
async function getBadgeCounts(user) {
  if (!user) return emptyBadgeCounts();

  try {
    const [messages, plans, mailbox] = await Promise.all([
      countUnreadPlanMessages(user),
      countActionPlans(user),
      countMailboxUnseen(user),
    ]);

    const total = messages + plans + (isStaff(user) ? mailbox : 0);

    return {
      messages: messages || 0,
      plans: plans || 0,
      mailbox: mailbox || 0,
      total: total || 0,
    };
  } catch (err) {
    console.warn('[notifications] badge counts failed:', err.message || err);
    return emptyBadgeCounts();
  }
}

/**
 * Refresh res.locals.badgeCounts after mark-read / mailbox open.
 */
async function refreshBadgeCounts(res, user) {
  const counts = await getBadgeCounts(user);
  if (res && res.locals) res.locals.badgeCounts = counts;
  return counts;
}

module.exports = {
  EMPTY_COUNTS,
  emptyBadgeCounts,
  ensureMessageReadsInitialized,
  getBadgeCounts,
  markPlanMessagesRead,
  refreshBadgeCounts,
};
