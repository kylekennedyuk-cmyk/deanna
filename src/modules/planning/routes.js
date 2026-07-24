const express = require('express');
const rateLimit = require('express-rate-limit');
const { prisma } = require('../../config/database');
const { sendNotification } = require('../../config/email');
const { getSettings } = require('../../config/settings');
const { ensureLoggedIn } = require('../../middleware/auth');

const router = express.Router();

const plannerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const STEPS = [
  { id: 1, key: 'basics', title: 'Trip basics' },
  { id: 2, key: 'travellers', title: 'Travellers' },
  { id: 3, key: 'style', title: 'Style & preferences' },
  { id: 4, key: 'disney', title: 'Disneyland focus' },
  { id: 5, key: 'budget', title: 'Budget' },
  { id: 6, key: 'stay', title: 'Accommodation' },
  { id: 7, key: 'special', title: 'Special needs' },
  { id: 8, key: 'review', title: 'Review & submit' },
];

function getDraft(req) {
  if (!req.session.plannerDraft) {
    req.session.plannerDraft = { step: 1, data: {} };
  }
  return req.session.plannerDraft;
}

router.get('/', (req, res) => {
  const draft = getDraft(req);
  const step = Math.min(Math.max(Number(req.query.step) || draft.step || 1, 1), 8);
  draft.step = step;
  res.render('planner/wizard', {
    title: 'Holiday Planner',
    steps: STEPS,
    step,
    data: draft.data,
    error: null,
  });
});

router.post('/step/:step', plannerLimiter, (req, res) => {
  const step = Number(req.params.step);
  const draft = getDraft(req);
  const cleaned = { ...req.body };
  delete cleaned._csrf;
  delete cleaned.action;
  delete cleaned.paceChip;
  delete cleaned.flexChip;
  draft.data = { ...draft.data, ...cleaned, stepSaved: step };

  if (req.body.action === 'back') {
    draft.step = Math.max(step - 1, 1);
    return res.redirect(`/planner?step=${draft.step}`);
  }

  if (step >= 8) {
    return res.redirect('/planner/submit');
  }

  draft.step = Math.min(step + 1, 8);
  return res.redirect(`/planner?step=${draft.step}`);
});

router.get('/submit', (req, res) => {
  res.redirect('/planner?step=8');
});

router.post('/submit', plannerLimiter, async (req, res, next) => {
  try {
    const draft = getDraft(req);
    const data = { ...draft.data, ...req.body };
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');

    if (!data.name || !data.email) {
      return res.status(400).render('planner/wizard', {
        title: 'Holiday Planner',
        steps: STEPS,
        step: 8,
        data,
        error: 'Please include your name and email so Deanna can reply.',
      });
    }

    const email = String(data.email).trim().toLowerCase();
    let customer = null;
    let needsAccountSetup = false;

    if (req.user) {
      customer = req.user;
    } else {
      customer = await prisma.user.findUnique({ where: { email } });
      if (!customer) {
        const tempPass = await bcrypt.hash(`temp-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`, 12);
        customer = await prisma.user.create({
          data: {
            name: String(data.name).trim(),
            email,
            username: email,
            phone: data.phone ? String(data.phone).trim() : null,
            passwordHash: tempPass,
            role: 'customer',
          },
        });
        needsAccountSetup = true;
      }
    }

    const partySize = Number(data.adults || 2) + Number(data.children || 0);
    const plan = await prisma.holidayPlan.create({
      data: {
        customerId: customer.id,
        status: 'new',
        travelDates: data.dates || data.travelDates || 'Flexible',
        partySize: partySize || 2,
        budget: Number(data.budget || 0),
        preferences: JSON.stringify(data),
      },
    });

    const settings = await getSettings();
    const support =
      settings.support_email ||
      process.env.SUPPORT_EMAIL ||
      'hello@destinationswithdeanna.com';
    const planName = `${data.occasion || 'Disneyland Paris holiday'} · Plan #${plan.id}`;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    await sendNotification('new_request', {
      to: support,
      values: {
        customerName: customer.name,
        planTitle: planName,
      },
      body: `Travel dates: ${plan.travelDates}\nParty size: ${plan.partySize}\nBudget: £${plan.budget || 0}\nEmail: ${customer.email}`,
      buttonLabel: 'Open request',
      buttonUrl: `${appUrl}/agent/plans/${plan.id}`,
    });

    delete req.session.plannerDraft;

    if (needsAccountSetup) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await prisma.passwordResetToken.deleteMany({
        where: { userId: customer.id, usedAt: null },
      });
      await prisma.passwordResetToken.create({
        data: {
          tokenHash,
          userId: customer.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      req.session.returnTo = `/customer/plans/${plan.id}?created=1`;
      await sendNotification('customer_confirmation', {
        to: customer.email,
        values: {
          customerName: customer.name,
          planTitle: planName,
        },
        body: `Travel dates: ${plan.travelDates}\nParty size: ${plan.partySize}\n\nFinish setting your password so you can return to your plan anytime. Your login username is your email address.`,
        buttonLabel: 'Set up your account',
        buttonUrl: `${appUrl}/setup-account/${token}`,
      });
      return res.redirect(`/setup-account/${token}`);
    }

    await sendNotification('customer_confirmation', {
      to: customer.email,
      values: {
        customerName: customer.name,
        planTitle: planName,
      },
      body: `Travel dates: ${plan.travelDates}\nParty size: ${plan.partySize}\n\nDeanna will review your preferences and contact you with the next step.`,
      buttonLabel: 'Open your plan',
      buttonUrl: `${appUrl}/customer/plans/${plan.id}`,
    });

    if (!req.user) {
      req.session.returnTo = `/customer/plans/${plan.id}`;
      return res.redirect('/login?planned=1');
    }

    return res.redirect(`/customer/plans/${plan.id}?created=1`);
  } catch (err) {
    next(err);
  }
});

router.get('/reset', (req, res) => {
  delete req.session.plannerDraft;
  res.redirect('/planner');
});

module.exports = router;
