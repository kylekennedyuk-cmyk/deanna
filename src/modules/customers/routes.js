const express = require('express');
const { prisma } = require('../../config/database');
const { requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(requireRole(['customer', 'admin']));

router.get('/', async (req, res, next) => {
  try {
    const plans = await prisma.holidayPlan.findMany({
      where: { customerId: req.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    res.render('customer/dashboard', {
      title: 'My holidays',
      plans,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/plans/:id', async (req, res, next) => {
  try {
    const plan = await prisma.holidayPlan.findFirst({
      where: { id: Number(req.params.id), customerId: req.user.id },
      include: { messages: { include: { sender: true }, orderBy: { createdAt: 'asc' } }, documents: true },
    });
    if (!plan) {
      return res.status(404).render('pages/error', { title: 'Not found', message: 'Plan not found.', status: 404 });
    }
    res.render('customer/plan', {
      title: `Plan #${plan.id}`,
      plan,
      preferences: safeJson(plan.preferences),
      created: req.query.created === '1',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/plans/:id/messages', async (req, res, next) => {
  try {
    const plan = await prisma.holidayPlan.findFirst({
      where: { id: Number(req.params.id), customerId: req.user.id },
      include: { messages: { include: { sender: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!plan) {
      return res.status(404).render('pages/error', { title: 'Not found', message: 'Plan not found.', status: 404 });
    }
    res.render('customer/messages', { title: 'Messages', plan });
  } catch (err) {
    next(err);
  }
});

router.post('/plans/:id/messages', async (req, res, next) => {
  try {
    const planId = Number(req.params.id);
    const plan = await prisma.holidayPlan.findFirst({
      where: { id: planId, customerId: req.user.id },
    });
    if (!plan) {
      return res.status(404).render('pages/error', { title: 'Not found', message: 'Plan not found.', status: 404 });
    }
    const content = String(req.body.content || '').trim();
    if (content) {
      await prisma.message.create({
        data: { planId, senderId: req.user.id, content },
      });
    }
    res.redirect(`/customer/plans/${planId}/messages`);
  } catch (err) {
    next(err);
  }
});

router.get('/profile', (req, res) => {
  res.render('customer/profile', { title: 'Profile', saved: false, error: null });
});

router.post('/profile', async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: String(req.body.name || req.user.name).trim(),
        phone: req.body.phone ? String(req.body.phone).trim() : null,
      },
    });
    res.render('customer/profile', { title: 'Profile', saved: true, error: null });
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
