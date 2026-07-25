const express = require('express');
const { prisma } = require('../../config/database');
const { sendNotification } = require('../../config/email');
const { getSettings } = require('../../config/settings');
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
      include: { agent: true },
    });
    if (!plan) {
      return res.status(404).render('pages/error', { title: 'Not found', message: 'Plan not found.', status: 404 });
    }
    const content = String(req.body.content || '').trim();
    if (content) {
      await prisma.message.create({
        data: { planId, senderId: req.user.id, content },
      });
      const settings = await getSettings();
      const recipient =
        (plan.agent && plan.agent.email) ||
        settings.support_email ||
        process.env.SUPPORT_EMAIL ||
        process.env.SMTP_FROM_EMAIL ||
        process.env.SMTP_USER;
      if (recipient) {
        try {
          const result = await sendNotification('new_message', {
            to: recipient,
            values: {
              senderName: req.user.name,
              planTitle: `Plan #${plan.id}`,
            },
            body: content,
            buttonLabel: 'Reply in the agent workspace',
            buttonUrl: `${process.env.APP_URL || 'http://localhost:3000'}/agent/plans/${plan.id}?tab=messages`,
          });
          if (result && result.skipped) {
            console.warn('[customer message email skipped]', result.reason);
          }
        } catch (err) {
          console.error('[customer message email]', err);
        }
      } else {
        console.warn('[customer message email] no agent/support recipient configured');
      }
    }
    res.redirect(`/customer/plans/${planId}/messages`);
  } catch (err) {
    next(err);
  }
});

router.get('/profile', (req, res) => {
  res.render('customer/profile', {
    title: 'Profile',
    saved: false,
    error: null,
    emailNotify: req.user.emailNotify,
  });
});

router.post('/profile', async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: String(req.body.name || req.user.name).trim(),
        phone: req.body.phone ? String(req.body.phone).trim() : null,
        emailNotify: req.body.emailNotify === '1',
      },
    });
    res.render('customer/profile', {
      title: 'Profile',
      saved: true,
      error: null,
      emailNotify: req.body.emailNotify === '1',
    });
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
