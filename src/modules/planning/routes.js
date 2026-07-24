const express = require('express');
const rateLimit = require('express-rate-limit');
const { prisma } = require('../../config/database');
const { sendMail } = require('../../config/email');
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
  draft.data = { ...draft.data, ...req.body, stepSaved: step };

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

    if (!data.name || !data.email) {
      return res.status(400).render('planner/wizard', {
        title: 'Holiday Planner',
        steps: STEPS,
        step: 8,
        data,
        error: 'Please include your name and email so Deanna can reply.',
      });
    }

    let customer = null;
    if (req.user) {
      customer = req.user;
    } else {
      customer = await prisma.user.findUnique({
        where: { email: String(data.email).trim().toLowerCase() },
      });
      if (!customer) {
        const bcrypt = require('bcryptjs');
        const tempPass = await bcrypt.hash(`temp-${Date.now()}`, 12);
        customer = await prisma.user.create({
          data: {
            name: String(data.name).trim(),
            email: String(data.email).trim().toLowerCase(),
            phone: data.phone ? String(data.phone).trim() : null,
            passwordHash: tempPass,
            role: 'customer',
          },
        });
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

    const support = process.env.SUPPORT_EMAIL || 'hello@destinationswithdeanna.com';
    await sendMail({
      to: support,
      subject: `New planning request #${plan.id}`,
      text: `New holiday plan from ${customer.name} (${customer.email}). Plan ID: ${plan.id}`,
    });
    await sendMail({
      to: customer.email,
      subject: 'We received your Disneyland Paris planning request',
      text: `Hi ${customer.name},\n\nThanks for starting your plan with Destinations With Deanna. Deanna will review your details and be in touch soon.\n\nYou can log in anytime to follow progress.`,
    });

    delete req.session.plannerDraft;

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
