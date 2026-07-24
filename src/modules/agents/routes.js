const express = require('express');
const { prisma } = require('../../config/database');
const { sendNotification } = require('../../config/email');
const { statusLabel } = require('../../utils/format');
const { requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(requireRole(['agent', 'admin']));

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

    const [newPlans, activePlans, recentMessages, openRequests, needsReview, newCount] = await Promise.all([
      prisma.holidayPlan.findMany({
        where: { status: 'new' },
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.holidayPlan.findMany({
        where: { status: 'in_progress' },
        include: { customer: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.message.findMany({
        include: { sender: true, plan: { include: { customer: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      prisma.holidayPlan.count({ where: { status: { in: ['new', 'in_progress'] } } }),
      prisma.holidayPlan.count({ where: { status: 'sent' } }),
      prisma.holidayPlan.count({ where: { status: 'new', createdAt: { gte: startOfDay } } }),
    ]);

    res.render('agent/dashboard', {
      title: 'Agent workspace',
      newPlans,
      activePlans,
      recentMessages,
      kpis: { openRequests, needsReview, newCount },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/plans', async (req, res, next) => {
  try {
    const plans = await prisma.holidayPlan.findMany({
      include: { customer: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.render('agent/plans', { title: 'All plans', plans });
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

    const priceFields = parseLabeled(plan.pricing);
    res.render('agent/plan', {
      title: `Plan #${plan.id}`,
      plan,
      preferences: safeJson(plan.preferences),
      tab: req.query.tab || 'overview',
      saved: req.query.saved === '1',
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

    await prisma.holidayPlan.update({ where: { id }, data });
    if (
      existingPlan &&
      existingPlan.customer.emailNotify &&
      data.status &&
      data.status !== existingPlan.status
    ) {
      await sendNotification('status_update', {
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
    if (plan.customer.emailNotify) {
      await sendNotification('status_update', {
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

router.post('/plans/:id/messages', async (req, res, next) => {
  try {
    const planId = Number(req.params.id);
    const content = String(req.body.content || '').trim();
    if (content) {
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
      if (plan.customer.emailNotify) {
        await sendNotification('new_message', {
          to: plan.customer.email,
          values: {
            senderName: req.user.name,
            planTitle: `Plan #${planId}`,
          },
          body: content,
          buttonLabel: 'Reply in your portal',
          buttonUrl: `${process.env.APP_URL || 'http://localhost:3000'}/customer/plans/${planId}/messages`,
        });
      }
    }
    res.redirect(`/agent/plans/${planId}?tab=messages`);
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
    res.render('agent/inbox', { title: 'Inbox', messages, q });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
