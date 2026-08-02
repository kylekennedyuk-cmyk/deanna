const express = require('express');
const bcrypt = require('bcryptjs');
const { prisma } = require('../../config/database');
const { sendNotification, sendNotificationAsync } = require('../../config/email');
const {
  deleteMessage,
  getMessage,
  listMessages,
  moveMessage,
  replySubject,
  saveDraft,
  sendMailboxMail,
} = require('../../config/mailbox');
const {
  statusLabel,
  nextStatusAfterMessage,
  ACTIVE_PLAN_STATUSES,
  BOOKED_PLAN_STATUSES,
  STAFF_ACTION_STATUSES,
  CHANGE_REQUEST_AREAS,
} = require('../../utils/format');
const { markPlanMessagesRead, refreshBadgeCounts } = require('../../utils/notifications');
const { streamPlanPdf } = require('../../utils/brandedPdf');
const { requireRole } = require('../../middleware/auth');
const { resolveHomeSections } = require('../../content/homeDefaults');
const { jsonUploadHandler, listMediaJson } = require('../../utils/mediaUpload');
const { mailboxAttachments, mailboxUploadError } = require('../../utils/mailboxUpload');

const router = express.Router();
router.use(requireRole(['agent', 'admin']));

function clearMailboxAttachmentBuffers(files) {
  if (!Array.isArray(files)) return;
  for (const file of files) {
    if (file) file.buffer = null;
  }
  files.length = 0;
}

function mapMailboxAttachments(files) {
  if (!Array.isArray(files) || !files.length) return [];
  return files.map((file) => ({
    filename: file.originalname || 'attachment',
    content: file.buffer,
    contentType: file.mimetype || 'application/octet-stream',
  }));
}

/** Public content pages agents may edit without full admin access. */
const AGENT_EDITABLE_SLUGS = [
  'home',
  'about',
  'hotels',
  'dining',
  'planning-advice',
  'contact',
  'disneyland-paris',
];

function isAgentEditablePage(page) {
  return page && AGENT_EDITABLE_SLUGS.includes(page.slug);
}

function agentEditorPaths(pageId) {
  return {
    list: '/agent/site',
    listLabel: 'Site content',
    save: `/agent/site/pages/${pageId}`,
    preview: `/agent/site/pages/${pageId}/preview`,
    mediaUpload: '/agent/site/media/upload',
    mediaJson: '/agent/site/media/json',
  };
}

async function loadPageSections(page) {
  let sections = [];
  try {
    sections = JSON.parse(page.sections || '[]');
  } catch {
    sections = [];
  }
  if (page.slug === 'home') {
    sections = resolveHomeSections(sections);
  }
  return sections;
}

const RECENT_MESSAGE_PREVIEW = 5;
const RECENT_MESSAGE_FETCH = 20;
const PLAN_STATUS_FILTERS = [
  'new',
  'in_progress',
  'awaiting_agent',
  'awaiting_client',
  'sent',
  'booked',
  'confirmed',
  'completed',
  'archived',
];

/**
 * Stamp booking dates the first time a plan reaches booked/confirmed so the
 * customer PDF can show a real "booked on" / "confirmed on" date.
 */
function bookingTimestamps(nextStatus, plan) {
  const data = {};
  if (!BOOKED_PLAN_STATUSES.includes(nextStatus)) return data;
  if (!plan.bookedAt) data.bookedAt = new Date();
  if (nextStatus === 'confirmed' && !plan.confirmedAt) data.confirmedAt = new Date();
  return data;
}

async function applyMessagingPlanStatus(plan, senderIsStaff, agentId) {
  const next = nextStatusAfterMessage(plan.status, senderIsStaff);
  if (!next || next === plan.status) return;
  const data = { status: next };
  if (senderIsStaff && agentId) data.agentId = agentId;
  await prisma.holidayPlan.update({ where: { id: plan.id }, data });
}

function mailboxFolder(req) {
  return String(req.query.folder || req.body.folder || 'INBOX').trim() || 'INBOX';
}

function mailboxUrl(folder, suffix = '') {
  const q = `folder=${encodeURIComponent(folder || 'INBOX')}`;
  return suffix ? `/agent/mailbox${suffix}?${q}` : `/agent/mailbox?${q}`;
}

function folderSidebar(folders, activePath) {
  const essentials = ['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive'];
  const primary = [];
  const other = [];
  (folders || []).forEach((folder) => {
    if (essentials.includes(folder.key)) primary.push(folder);
    else other.push(folder);
  });
  primary.sort((a, b) => essentials.indexOf(a.key) - essentials.indexOf(b.key));
  return { primary, other, activePath };
}

function safeJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function parseLabeled(text) {
  const fields = {};
  String(text || '')
    .split('\n')
    .forEach((line) => {
      const idx = line.indexOf(':');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (key === 'airline') fields.airline = val;
      if (key === 'uk airport' || key === 'airport') fields.airport = val;
      if (key === 'outbound') fields.outbound = val;
      if (key === 'return') fields.return = val;
      if (key === 'notes' || key === 'notes for client') fields.notes = val;
      if (key === 'hotel' || key === 'hotel name') fields.name = val;
      if (key === 'room' || key === 'room type') fields.room = val;
      if (key === 'board') fields.board = val;
      if (key === 'nights') fields.nights = val;
      if (key === 'why this hotel') fields.notes = val;
      if (key === 'total') fields.total = val.replace(/[£,\s]/g, '');
      if (key === 'deposit') fields.deposit = val.replace(/[£,\s]/g, '');
      if (key === 'included' || key === "what's included" || key === 'whats included') fields.includes = val;
      if (key === 'margin' || key === 'margin notes') fields.margin = val;
    });

  // Fallback: keep free text in notes if nothing parsed
  if (!Object.keys(fields).length && text) {
    fields.notes = String(text);
    fields.includes = String(text);
  }
  return fields;
}

function buildFlights(body) {
  const lines = [
    body.flightAirline && `Airline: ${body.flightAirline}`,
    body.flightAirport && `UK airport: ${body.flightAirport}`,
    body.flightOutbound && `Outbound: ${body.flightOutbound}`,
    body.flightReturn && `Return: ${body.flightReturn}`,
    body.flightNotes && `Notes: ${body.flightNotes}`,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : undefined;
}

function buildHotel(body) {
  const lines = [
    body.hotelName && `Hotel: ${body.hotelName}`,
    body.hotelRoom && `Room type: ${body.hotelRoom}`,
    body.hotelBoard && `Board: ${body.hotelBoard}`,
    body.hotelNights && `Nights: ${body.hotelNights}`,
    body.hotelNotes && `Why this hotel: ${body.hotelNotes}`,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : undefined;
}

function buildPricing(body) {
  const lines = [
    body.priceTotal && `Total: £${body.priceTotal}`,
    body.priceDeposit && `Deposit: £${body.priceDeposit}`,
    body.priceIncludes && `What's included: ${body.priceIncludes}`,
    body.priceMargin && `Margin notes: ${body.priceMargin}`,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : undefined;
}

router.get('/', async (req, res, next) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      newPlans,
      actionPlans,
      bookedPlans,
      recentMessages,
      openRequests,
      actionRequired,
      awaitingClient,
      newCount,
      bookedCount,
    ] = await Promise.all([
        prisma.holidayPlan.findMany({
          where: { status: 'new' },
          include: { customer: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.holidayPlan.findMany({
          where: { status: 'awaiting_agent' },
          include: { customer: true },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
        prisma.holidayPlan.findMany({
          where: { status: { in: BOOKED_PLAN_STATUSES } },
          include: { customer: true },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
        prisma.message.findMany({
          include: { sender: true, plan: { include: { customer: true } } },
          orderBy: { createdAt: 'desc' },
          take: RECENT_MESSAGE_FETCH,
        }),
        prisma.holidayPlan.count({
          where: { status: { in: ACTIVE_PLAN_STATUSES } },
        }),
        prisma.holidayPlan.count({ where: { status: { in: STAFF_ACTION_STATUSES } } }),
        prisma.holidayPlan.count({
          where: { status: { in: ['awaiting_client', 'sent'] } },
        }),
        prisma.holidayPlan.count({ where: { status: 'new', createdAt: { gte: startOfDay } } }),
        prisma.holidayPlan.count({ where: { status: { in: BOOKED_PLAN_STATUSES } } }),
      ]);

    res.render('agent/dashboard', {
      title: 'Agent workspace',
      newPlans,
      actionPlans,
      bookedPlans,
      recentMessages,
      messagePreviewLimit: RECENT_MESSAGE_PREVIEW,
      kpis: { openRequests, actionRequired, awaitingClient, newCount, bookedCount },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/plans', async (req, res, next) => {
  try {
    const filter = String(req.query.filter || 'active').toLowerCase();
    let where = {};
    let title = 'Active plans';

    if (filter === 'all') {
      where = {};
      title = 'All plans';
    } else if (filter === 'action') {
      where = { status: { in: STAFF_ACTION_STATUSES } };
      title = 'Action required';
    } else if (filter === 'awaiting_client') {
      where = { status: { in: ['awaiting_client', 'sent'] } };
      title = 'Awaiting client';
    } else if (filter === 'bookings') {
      where = { status: { in: BOOKED_PLAN_STATUSES } };
      title = 'Bookings';
    } else if (PLAN_STATUS_FILTERS.includes(filter)) {
      where = { status: filter };
      title = statusLabel(filter);
    } else {
      // active (default): exclude completed / archived
      where = { status: { in: ACTIVE_PLAN_STATUSES } };
      title = 'Active plans';
    }

    const plans = await prisma.holidayPlan.findMany({
      where,
      include: {
        customer: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const unreadByPlan = {};
    if (plans.length) {
      const unread = await prisma.message.findMany({
        where: {
          planId: { in: plans.map((p) => p.id) },
          senderId: { not: req.user.id },
          reads: { none: { userId: req.user.id } },
        },
        select: { planId: true },
      });
      unread.forEach((m) => {
        unreadByPlan[m.planId] = (unreadByPlan[m.planId] || 0) + 1;
      });
    }

    res.render('agent/plans', {
      title,
      plans,
      filter: ['all', 'active', 'action', 'awaiting_client', 'bookings', ...PLAN_STATUS_FILTERS].includes(
        filter
      )
        ? filter
        : 'active',
      unreadByPlan,
      deleted: req.query.deleted === '1',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/plans/:id/pdf', async (req, res, next) => {
  try {
    const plan = await prisma.holidayPlan.findUnique({
      where: { id: Number(req.params.id) },
      include: { customer: true },
    });
    if (!plan) {
      return res.status(404).render('pages/error', { title: 'Not found', message: 'Plan not found.', status: 404 });
    }
    await streamPlanPdf(res, { plan, type: req.query.type, forAgent: true });
  } catch (err) {
    next(err);
  }
});

router.get('/plans/:id', async (req, res, next) => {
  try {
    const plan = await prisma.holidayPlan.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        customer: true,
        messages: { include: { sender: true }, orderBy: { createdAt: 'asc' } },
        documents: true,
      },
    });
    if (!plan) {
      return res.status(404).render('pages/error', { title: 'Not found', message: 'Plan not found.', status: 404 });
    }

    const tab = req.query.tab || 'overview';
    let planUnreadMessages = 0;
    if (tab === 'messages') {
      await markPlanMessagesRead(req.user, plan.id);
      await refreshBadgeCounts(res, req.user);
      planUnreadMessages = 0;
    } else {
      planUnreadMessages = await prisma.message.count({
        where: {
          planId: plan.id,
          senderId: { not: req.user.id },
          reads: { none: { userId: req.user.id } },
        },
      });
    }

    const priceFields = parseLabeled(plan.pricing);
    res.render('agent/plan', {
      title: `Plan #${plan.id}`,
      plan,
      preferences: safeJson(plan.preferences),
      tab,
      planUnreadMessages,
      saved: req.query.saved === '1',
      deleted: req.query.deleted === '1',
      emailed: req.query.emailed === '1',
      emailWarn: req.query.email_warn === '1',
      emailDetail: req.query.email_detail ? String(req.query.email_detail) : '',
      flightFields: parseLabeled(plan.flights),
      hotelFields: parseLabeled(plan.hotel),
      priceFields,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/plans/:id/update', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existingPlan = await prisma.holidayPlan.findUnique({
      where: { id },
      include: { customer: true },
    });
    const data = {
      status: req.body.status || undefined,
      notes: req.body.notes !== undefined ? String(req.body.notes) : undefined,
      itinerary: req.body.itinerary !== undefined ? String(req.body.itinerary) : undefined,
      agentId: req.user.id,
    };

    const flights = buildFlights(req.body);
    const hotel = buildHotel(req.body);
    const pricing = buildPricing(req.body);
    if (flights !== undefined) data.flights = flights;
    if (hotel !== undefined) data.hotel = hotel;
    if (pricing !== undefined) data.pricing = pricing;

    // Allow clearing via empty structured forms when tab posts intentionally
    if (req.body.tab === 'flights' && flights === undefined) data.flights = '';
    if (req.body.tab === 'hotel' && hotel === undefined) data.hotel = '';
    if (req.body.tab === 'pricing' && pricing === undefined) data.pricing = '';

    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    if (data.status && existingPlan) Object.assign(data, bookingTimestamps(data.status, existingPlan));

    await prisma.holidayPlan.update({ where: { id }, data });
    if (existingPlan && data.status && data.status !== existingPlan.status && existingPlan.customer?.email) {
      sendNotificationAsync('status_update', {
        to: existingPlan.customer.email,
        values: {
          customerName: existingPlan.customer.name,
          planTitle: `Plan #${id}`,
          status: statusLabel(data.status),
        },
        body: `Deanna has updated your holiday plan to “${statusLabel(data.status)}”. Log in to review the latest details and messages.`,
        buttonLabel: 'View your holiday plan',
        buttonUrl: `${process.env.APP_URL || 'http://localhost:3000'}/customer/plans/${id}`,
      });
    }
    res.redirect(`/agent/plans/${id}?tab=${req.body.tab || 'overview'}&saved=1`);
  } catch (err) {
    next(err);
  }
});

router.post('/plans/:id/send', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const plan = await prisma.holidayPlan.update({
      where: { id },
      data: { status: 'sent', agentId: req.user.id },
      include: { customer: true },
    });
    if (plan.customer?.email) {
      sendNotificationAsync('status_update', {
        to: plan.customer.email,
        values: {
          customerName: plan.customer.name,
          planTitle: `Plan #${id}`,
          status: 'Ready to review',
        },
        body: 'Deanna has shared your holiday proposal. Review the details in your portal and send a message if you would like anything adjusted.',
        buttonLabel: 'Review your proposal',
        buttonUrl: `${process.env.APP_URL || 'http://localhost:3000'}/customer/plans/${id}`,
      });
    }
    res.redirect(`/agent/plans/${id}?tab=overview&saved=1`);
  } catch (err) {
    next(err);
  }
});

/**
 * Booking details panel: save the reference/confirmation copy and optionally
 * move the plan to booked or confirmed. Confirming emails the customer so they
 * know their branded confirmation PDF is ready to download.
 */
router.post('/plans/:id/booking', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existingPlan = await prisma.holidayPlan.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!existingPlan) {
      return res.status(404).render('pages/error', { title: 'Not found', message: 'Plan not found.', status: 404 });
    }

    const action = String(req.body.action || 'save');
    const reference = String(req.body.bookingReference || '').trim();
    const details = String(req.body.confirmationDetails || '').trim();

    const data = {
      bookingReference: reference || null,
      confirmationDetails: details || null,
      agentId: req.user.id,
    };
    if (BOOKED_PLAN_STATUSES.includes(action)) {
      data.status = action;
      Object.assign(data, bookingTimestamps(action, existingPlan));
    }

    await prisma.holidayPlan.update({ where: { id }, data });

    const params = new URLSearchParams({ tab: 'booking', saved: '1' });
    const customerEmail = String(existingPlan.customer?.email || '').trim();

    if (data.status && data.status !== existingPlan.status) {
      if (!customerEmail) {
        params.set('email_warn', '1');
        params.set(
          'email_detail',
          'Booking saved, but the customer has no email address on file so no confirmation was sent.'
        );
      } else {
        const confirmed = data.status === 'confirmed';
        const bodyLines = [
          confirmed
            ? 'Wonderful news — your Disneyland Paris holiday is confirmed.'
            : 'Your holiday is booked and being finalised with our suppliers.',
          reference ? `Booking reference: ${reference}` : '',
          details,
          confirmed
            ? 'You can download your branded booking confirmation and itinerary as PDFs from your portal at any time.'
            : 'Your full confirmation documents will follow shortly.',
        ].filter(Boolean);

        sendNotificationAsync('status_update', {
          to: customerEmail,
          values: {
            customerName: existingPlan.customer.name,
            planTitle: `Plan #${id}`,
            status: statusLabel(data.status),
          },
          body: bodyLines.join('\n\n'),
          buttonLabel: confirmed ? 'Download your confirmation' : 'View your booking',
          buttonUrl: `${process.env.APP_URL || 'http://localhost:3000'}/customer/plans/${id}`,
        });
        params.set('emailed', '1');
      }
    }

    res.redirect(`/agent/plans/${id}?${params.toString()}`);
  } catch (err) {
    next(err);
  }
});

router.post('/plans/:id/delete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const plan = await prisma.holidayPlan.findUnique({ where: { id } });
    if (!plan) {
      return res.status(404).render('pages/error', {
        title: 'Not found',
        message: 'Plan not found.',
        status: 404,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.messageRead.deleteMany({ where: { message: { planId: id } } });
      await tx.message.deleteMany({ where: { planId: id } });
      await tx.document.deleteMany({ where: { planId: id } });
      await tx.holidayPlan.delete({ where: { id } });
    });

    res.redirect('/agent/plans?filter=active&deleted=1');
  } catch (err) {
    next(err);
  }
});

router.post('/plans/:id/messages/:messageId/delete', async (req, res, next) => {
  try {
    const planId = Number(req.params.id);
    const messageId = Number(req.params.messageId);
    const message = await prisma.message.findFirst({
      where: { id: messageId, planId },
    });
    if (!message) {
      return res.status(404).render('pages/error', {
        title: 'Not found',
        message: 'Message not found.',
        status: 404,
      });
    }

    await prisma.message.delete({ where: { id: messageId } });
    res.redirect(`/agent/plans/${planId}?tab=messages&deleted=1`);
  } catch (err) {
    next(err);
  }
});

router.post('/plans/:id/messages', async (req, res, next) => {
  try {
    const planId = Number(req.params.id);
    const content = String(req.body.content || '').trim();
    if (!content) {
      return res.redirect(`/agent/plans/${planId}?tab=messages`);
    }

    const plan = await prisma.holidayPlan.findUnique({
      where: { id: planId },
      include: { customer: true },
    });
    if (!plan) {
      return res.status(404).render('pages/error', {
        title: 'Not found',
        message: 'Plan not found.',
        status: 404,
      });
    }

    await prisma.message.create({ data: { planId, senderId: req.user.id, content } });
    await applyMessagingPlanStatus(plan, true, req.user.id);
    await markPlanMessagesRead(req.user, planId);

    const params = new URLSearchParams({ tab: 'messages' });
    const customerEmail = String(plan.customer?.email || '').trim();

    if (!customerEmail) {
      params.set('email_warn', '1');
      params.set('email_detail', 'Message saved, but the customer has no email address on file.');
      return res.redirect(`/agent/plans/${planId}?${params.toString()}`);
    }

    // Don't block the browser on slow SMTP — send in the background.
    sendNotificationAsync('new_message', {
      to: customerEmail,
      values: {
        senderName: req.user.name,
        customerName: plan.customer.name || '',
        planTitle: `Plan #${planId}`,
      },
      body: content,
      buttonLabel: 'Reply in your portal',
      buttonUrl: `${process.env.APP_URL || 'http://localhost:3000'}/customer/plans/${planId}/messages`,
    });

    params.set('emailed', '1');
    return res.redirect(`/agent/plans/${planId}?${params.toString()}`);
  } catch (err) {
    next(err);
  }
});

router.get('/inbox', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    let messages = await prisma.message.findMany({
      include: { sender: true, plan: { include: { customer: true } } },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    if (q) {
      messages = messages.filter(
        (m) =>
          m.content.toLowerCase().includes(q) ||
          m.sender.name.toLowerCase().includes(q) ||
          m.plan.customer.name.toLowerCase().includes(q)
      );
    }
    res.render('agent/inbox', {
      title: 'Inbox',
      messages,
      q,
      messagePreviewLimit: RECENT_MESSAGE_PREVIEW,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/mailbox', async (req, res) => {
  const folder = mailboxFolder(req);
  let messages = [];
  let total = 0;
  let folders = [];
  let activeFolder = folder;
  let error = req.query.error ? String(req.query.error) : null;
  const sent = req.query.sent === '1';
  const saved = req.query.saved === '1';
  const deleted = req.query.deleted === '1';
  const attachIgnored = req.query.attachIgnored === '1';
  try {
    const result = await listMessages(folder, { limit: 60 });
    messages = result.messages || [];
    total = result.total || messages.length;
    folders = result.folders || [];
    activeFolder = result.folder || folder;
  } catch (err) {
    error = err.message || 'Could not load mailbox.';
  }
  // listMessages warms unseen cache via STATUS on the same IMAP connection.
  try {
    await refreshBadgeCounts(res, req.user, { refreshMailbox: false });
  } catch {
    /* ignore */
  }
  const sidebar = folderSidebar(folders, activeFolder);
  return res.render('agent/mailbox', {
    title: 'Email mailbox',
    messages,
    total,
    folders,
    sidebar,
    activeFolder,
    error,
    sent,
    saved,
    deleted,
    attachIgnored,
    account: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || process.env.IMAP_USER || '',
  });
});

router.get('/mailbox/compose', async (req, res) => {
  return res.render('agent/mailbox-compose', {
    title: 'Compose email',
    mode: 'compose',
    error: req.query.error || null,
    activeFolder: mailboxFolder(req),
    form: {
      to: '',
      cc: '',
      subject: '',
      body: '',
      inReplyTo: '',
      references: '',
      folder: mailboxFolder(req),
    },
  });
});

router.get('/mailbox/m/:uid/reply', async (req, res) => {
  const folder = mailboxFolder(req);
  try {
    const message = await getMessage(folder, req.params.uid);
    const quoted = String(message.text || '')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    return res.render('agent/mailbox-compose', {
      title: 'Reply',
      mode: 'reply',
      error: null,
      activeFolder: folder,
      form: {
        to: message.fromAddress || message.from || '',
        cc: '',
        subject: replySubject(message.subject),
        body: `\n\nOn ${message.date ? new Date(message.date).toUTCString() : 'the original message'}, ${message.from} wrote:\n${quoted}`,
        inReplyTo: message.messageId || '',
        references: [message.references, message.messageId].filter(Boolean).join(' ').trim(),
        folder,
      },
    });
  } catch (err) {
    return res.redirect(
      `${mailboxUrl(folder)}&error=${encodeURIComponent(err.message || 'Could not open message for reply.')}`
    );
  }
});

router.get('/mailbox/m/:uid', async (req, res) => {
  const folder = mailboxFolder(req);
  try {
    const message = await getMessage(folder, req.params.uid);
    // getMessage refreshes unseen cache on the same IMAP connection when marking Seen.
    await refreshBadgeCounts(res, req.user, { refreshMailbox: false });
    return res.render('agent/mailbox-message', {
      title: message.subject,
      message,
      activeFolder: folder,
      error: null,
    });
  } catch (err) {
    return res.status(404).render('agent/mailbox-message', {
      title: 'Message',
      message: null,
      activeFolder: folder,
      error: err.message || 'Could not open message.',
    });
  }
});

router.post('/mailbox/m/:uid/delete', async (req, res) => {
  const folder = mailboxFolder(req);
  try {
    const result = await deleteMessage(folder, req.params.uid);
    if (result.permanent) {
      return res.redirect(`${mailboxUrl(folder)}&deleted=1`);
    }
    return res.redirect(`${mailboxUrl(result.folder || 'Trash')}&deleted=1`);
  } catch (err) {
    return res.redirect(
      `${mailboxUrl(folder)}&error=${encodeURIComponent(err.message || 'Could not delete message.')}`
    );
  }
});

router.post('/mailbox/m/:uid/move', async (req, res) => {
  const folder = mailboxFolder(req);
  const destination = String(req.body.destination || '').trim();
  try {
    const result = await moveMessage(folder, req.params.uid, destination);
    return res.redirect(mailboxUrl(result.folder || destination));
  } catch (err) {
    return res.redirect(
      `${mailboxUrl(folder)}&error=${encodeURIComponent(err.message || 'Could not move message.')}`
    );
  }
});

router.post('/mailbox/send', (req, res, next) => {
  mailboxAttachments(req, res, (err) => {
    if (err) {
      const mode = String((req.body && req.body.mode) || 'compose');
      const folder = String((req.body && req.body.folder) || 'INBOX').trim() || 'INBOX';
      return res.status(400).render('agent/mailbox-compose', {
        title: mode === 'reply' ? 'Reply' : 'Compose email',
        mode,
        error: mailboxUploadError(err),
        activeFolder: folder,
        form: {
          to: String((req.body && req.body.to) || ''),
          cc: String((req.body && req.body.cc) || ''),
          subject: String((req.body && req.body.subject) || ''),
          body: String((req.body && req.body.body) || ''),
          inReplyTo: String((req.body && req.body.inReplyTo) || ''),
          references: String((req.body && req.body.references) || ''),
          folder,
        },
      });
    }
    return next();
  });
}, async (req, res) => {
  const to = String(req.body.to || '').trim();
  const cc = String(req.body.cc || '').trim();
  const subject = String(req.body.subject || '').trim();
  const body = String(req.body.body || '').trim();
  const inReplyTo = String(req.body.inReplyTo || '').trim();
  const references = String(req.body.references || '').trim();
  const mode = String(req.body.mode || 'compose');
  const folder = String(req.body.folder || 'INBOX').trim() || 'INBOX';
  const action = String(req.body.action || 'send');
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];
  const hadAttachments = uploadedFiles.length > 0;

  const form = { to, cc, subject, body, inReplyTo, references, folder };

  if (action === 'draft') {
    clearMailboxAttachmentBuffers(uploadedFiles);
    try {
      const draft = await saveDraft({ to, cc, subject, text: body });
      const attachQ = hadAttachments ? '&attachIgnored=1' : '';
      return res.redirect(
        `/agent/mailbox?folder=${encodeURIComponent(draft.folder || 'Drafts')}&saved=1${attachQ}`
      );
    } catch (err) {
      return res.render('agent/mailbox-compose', {
        title: mode === 'reply' ? 'Reply' : 'Compose email',
        mode,
        error: err.message || 'Could not save draft.',
        activeFolder: folder,
        form,
      });
    }
  }

  if (!to || !subject || !body) {
    clearMailboxAttachmentBuffers(uploadedFiles);
    return res.render('agent/mailbox-compose', {
      title: mode === 'reply' ? 'Reply' : 'Compose email',
      mode,
      error: 'To, subject and message are required.',
      activeFolder: folder,
      form,
    });
  }

  const attachments = mapMailboxAttachments(uploadedFiles);
  // Drop multer file refs; attachment buffers stay alive until send finishes.
  if (req.files) req.files = [];

  try {
    // Send in the background so compose doesn't hang on slow SMTP.
    // Explicit .catch so a rejected promise can never become an unhandledRejection.
    setImmediate(() => {
      Promise.resolve()
        .then(() =>
          sendMailboxMail({
            to,
            cc: cc || undefined,
            subject,
            text: body,
            inReplyTo: inReplyTo || undefined,
            references: references || undefined,
            attachments: attachments.length ? attachments : undefined,
          })
        )
        .catch((err) => {
          console.error('[mailbox send]', err && err.message ? err.message : err);
        })
        .finally(() => {
          for (const attachment of attachments) {
            if (attachment) attachment.content = null;
          }
          attachments.length = 0;
        });
    });
    return res.redirect('/agent/mailbox?folder=Sent&sent=1');
  } catch (err) {
    for (const attachment of attachments) {
      if (attachment) attachment.content = null;
    }
    attachments.length = 0;
    return res.render('agent/mailbox-compose', {
      title: mode === 'reply' ? 'Reply' : 'Compose email',
      mode,
      error: err.message || 'Send failed.',
      activeFolder: folder,
      form,
    });
  }
});

router.get('/password', (req, res) => {
  res.render('agent/password', {
    title: 'Change password',
    saved: req.query.saved === '1',
    error: null,
  });
});

router.post('/password', async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    const renderError = (message, status = 400) =>
      res.status(status).render('agent/password', {
        title: 'Change password',
        saved: false,
        error: message,
      });

    if (!currentPassword || !newPassword || !confirmPassword) {
      return renderError('All password fields are required.');
    }
    if (newPassword.length < 8) {
      return renderError('New password must be at least 8 characters.');
    }
    if (newPassword !== confirmPassword) {
      return renderError('New password and confirmation do not match.');
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return renderError('Account not found.', 404);
    }

    const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentOk) {
      return renderError('Current password is incorrect.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return res.redirect('/agent/password?saved=1');
  } catch (err) {
    return next(err);
  }
});

router.get('/change-requests', async (req, res, next) => {
  try {
    const requests = await prisma.changeRequest.findMany({
      where: { requesterId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.render('agent/change-requests', {
      title: 'Site changes',
      requests,
      areas: CHANGE_REQUEST_AREAS,
      saved: req.query.saved === '1',
      error: null,
      form: { area: 'homepage', title: '', details: '' },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/change-requests', async (req, res, next) => {
  try {
    const areaRaw = String(req.body.area || '').trim();
    const title = String(req.body.title || '').trim();
    const details = String(req.body.details || '').trim();
    const validAreas = CHANGE_REQUEST_AREAS.map((item) => item.value);
    const area = validAreas.includes(areaRaw) ? areaRaw : 'other';

    if (!title || !details) {
      const requests = await prisma.changeRequest.findMany({
        where: { requesterId: req.user.id },
        orderBy: { createdAt: 'desc' },
      });
      return res.status(400).render('agent/change-requests', {
        title: 'Site changes',
        requests,
        areas: CHANGE_REQUEST_AREAS,
        saved: false,
        error: 'Title and details are required.',
        form: { area, title, details },
      });
    }

    await prisma.changeRequest.create({
      data: {
        requesterId: req.user.id,
        area,
        title,
        details,
      },
    });
    res.redirect('/agent/change-requests?saved=1');
  } catch (err) {
    next(err);
  }
});

router.get('/site', async (req, res, next) => {
  try {
    const pages = await prisma.page.findMany({
      where: { slug: { in: AGENT_EDITABLE_SLUGS } },
      orderBy: { slug: 'asc' },
    });
    res.render('agent/site', {
      title: 'Site content',
      pages,
      saved: req.query.saved === '1',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/site/media/json', listMediaJson);
router.post('/site/media/upload', jsonUploadHandler);

router.get('/site/pages/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [page, media] = await Promise.all([
      prisma.page.findUnique({ where: { id } }),
      prisma.media.findMany({ orderBy: { uploadedAt: 'desc' } }),
    ]);
    if (!page || !isAgentEditablePage(page)) {
      return res.status(404).render('pages/error', {
        title: 'Not found',
        message: 'That page is not available for agent editing. Use a site change request instead.',
        status: 404,
      });
    }
    const sections = await loadPageSections(page);
    res.render('admin/page-edit', {
      title: `Edit ${page.title}`,
      page,
      sections,
      media,
      error: null,
      saved: req.query.saved === '1',
      editorPaths: agentEditorPaths(page.id),
      agentScoped: true,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/site/pages/:id/preview', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { id: Number(req.params.id) } });
    if (!page || !isAgentEditablePage(page)) {
      return res.status(404).render('pages/error', {
        title: 'Not found',
        message: 'Page not found.',
        status: 404,
      });
    }
    const sections = await loadPageSections(page);
    return res.render(page.slug === 'home' ? 'pages/home' : 'pages/rich', {
      title: `${page.title} preview`,
      seoDesc: page.seoDesc,
      sections,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/site/pages/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.page.findUnique({ where: { id } });
    if (!existing || !isAgentEditablePage(existing)) {
      return res.status(404).render('pages/error', {
        title: 'Not found',
        message: 'That page is not available for agent editing.',
        status: 404,
      });
    }

    let sections;
    try {
      sections = JSON.parse(String(req.body.sections || '[]'));
      if (!Array.isArray(sections)) throw new Error('Sections must be an array');
    } catch {
      const media = await prisma.media.findMany({ orderBy: { uploadedAt: 'desc' } });
      return res.status(400).render('admin/page-edit', {
        title: `Edit ${existing.title}`,
        page: existing,
        sections: [],
        media,
        error: 'The page sections could not be saved. Please review the section fields.',
        saved: false,
        editorPaths: agentEditorPaths(id),
        agentScoped: true,
      });
    }

    // Agents may edit content/images but not publish or rename SEO freely beyond content fields.
    // Allow title/seo updates for allowlisted pages so image + copy edits stay coherent.
    await prisma.page.update({
      where: { id },
      data: {
        title: String(req.body.title || '').trim() || existing.title,
        seoTitle: req.body.seoTitle ? String(req.body.seoTitle).trim() : null,
        seoDesc: req.body.seoDesc ? String(req.body.seoDesc).trim() : null,
        sections: JSON.stringify(sections),
        published: existing.published,
      },
    });
    res.redirect(`/agent/site/pages/${id}?saved=1`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
