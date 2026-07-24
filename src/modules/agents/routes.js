const express = require('express');
const { prisma } = require('../../config/database');
const { requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(requireRole(['agent', 'admin']));

router.get('/', async (req, res, next) => {
  try {
    const [newPlans, activePlans, recentMessages] = await Promise.all([
      prisma.holidayPlan.findMany({
        where: { status: 'new' },
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.holidayPlan.findMany({
        where: { status: { in: ['in_progress', 'sent'] } },
        include: { customer: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.message.findMany({
        include: { sender: true, plan: { include: { customer: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    res.render('agent/dashboard', {
      title: 'Agent workspace',
      newPlans,
      activePlans,
      recentMessages,
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
    res.render('agent/plan', {
      title: `Plan #${plan.id}`,
      plan,
      preferences: safeJson(plan.preferences),
      tab: req.query.tab || 'overview',
      saved: req.query.saved === '1',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/plans/:id/update', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = {
      status: req.body.status || undefined,
      notes: req.body.notes ?? undefined,
      flights: req.body.flights ? String(req.body.flights) : undefined,
      hotel: req.body.hotel ? String(req.body.hotel) : undefined,
      itinerary: req.body.itinerary ? String(req.body.itinerary) : undefined,
      pricing: req.body.pricing ? String(req.body.pricing) : undefined,
      agentId: req.user.role === 'agent' ? req.user.id : req.user.id,
    };

    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    await prisma.holidayPlan.update({ where: { id }, data });
    res.redirect(`/agent/plans/${id}?tab=${req.body.tab || 'overview'}&saved=1`);
  } catch (err) {
    next(err);
  }
});

router.post('/plans/:id/messages', async (req, res, next) => {
  try {
    const planId = Number(req.params.id);
    const content = String(req.body.content || '').trim();
    if (content) {
      await prisma.message.create({
        data: { planId, senderId: req.user.id, content },
      });
    }
    res.redirect(`/agent/plans/${planId}?tab=messages`);
  } catch (err) {
    next(err);
  }
});

router.get('/inbox', async (req, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      include: { sender: true, plan: { include: { customer: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.render('agent/inbox', { title: 'Inbox', messages });
  } catch (err) {
    next(err);
  }
});

function safeJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

module.exports = router;
