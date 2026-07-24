const express = require('express');
const bcrypt = require('bcryptjs');
const { prisma } = require('../../config/database');
const { requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(requireRole(['admin']));

router.get('/', async (req, res, next) => {
  try {
    const [users, plans, pages, deals] = await Promise.all([
      prisma.user.count(),
      prisma.holidayPlan.count(),
      prisma.page.count(),
      prisma.deal.count({ where: { active: true } }),
    ]);
    res.render('admin/dashboard', {
      title: 'Admin',
      stats: { users, plans, pages, deals },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/pages', async (req, res, next) => {
  try {
    const pages = await prisma.page.findMany({ orderBy: { slug: 'asc' } });
    res.render('admin/pages', { title: 'Pages', pages, saved: req.query.saved === '1' });
  } catch (err) {
    next(err);
  }
});

router.get('/pages/:id', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { id: Number(req.params.id) } });
    if (!page) {
      return res.status(404).render('pages/error', { title: 'Not found', message: 'Page not found.', status: 404 });
    }
    res.render('admin/page-edit', { title: `Edit ${page.title}`, page, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/pages/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.page.update({
      where: { id },
      data: {
        title: String(req.body.title || '').trim(),
        seoTitle: req.body.seoTitle ? String(req.body.seoTitle).trim() : null,
        seoDesc: req.body.seoDesc ? String(req.body.seoDesc).trim() : null,
        sections: String(req.body.sections || '[]'),
        published: req.body.published === 'on',
      },
    });
    res.redirect('/admin/pages?saved=1');
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    res.render('admin/users', {
      title: 'Users',
      users,
      saved: req.query.saved === '1',
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const username = req.body.username ? String(req.body.username).trim().toLowerCase() : null;
    const password = String(req.body.password || '');
    if (!email || !password || password.length < 8) {
      const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
      return res.status(400).render('admin/users', {
        title: 'Users',
        users,
        saved: false,
        error: 'Email and password (min 8 characters) are required.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        name: String(req.body.name || email).trim(),
        email,
        username,
        role: req.body.role || 'customer',
        passwordHash,
      },
    });
    res.redirect('/admin/users?saved=1');
  } catch (err) {
    next(err);
  }
});

router.get('/deals', async (req, res, next) => {
  try {
    const deals = await prisma.deal.findMany({ orderBy: { createdAt: 'desc' } });
    res.render('admin/deals', { title: 'Deals', deals, saved: req.query.saved === '1' });
  } catch (err) {
    next(err);
  }
});

router.post('/deals', async (req, res, next) => {
  try {
    await prisma.deal.create({
      data: {
        title: String(req.body.title || '').trim(),
        description: String(req.body.description || '').trim(),
        price: req.body.price ? Number(req.body.price) : null,
        active: req.body.active === 'on',
      },
    });
    res.redirect('/admin/deals?saved=1');
  } catch (err) {
    next(err);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const rows = await prisma.siteSetting.findMany();
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.render('admin/settings', {
      title: 'Settings',
      settings,
      saved: req.query.saved === '1',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/settings', async (req, res, next) => {
  try {
    const keys = ['site_name', 'site_tagline', 'support_email', 'planner_enabled', 'maintenance_mode'];
    for (const key of keys) {
      if (req.body[key] === undefined) continue;
      await prisma.siteSetting.upsert({
        where: { key },
        update: { value: String(req.body[key]) },
        create: { key, value: String(req.body[key]) },
      });
    }
    res.redirect('/admin/settings?saved=1');
  } catch (err) {
    next(err);
  }
});

router.get('/navigation', async (req, res, next) => {
  try {
    const items = await prisma.navItem.findMany({ orderBy: [{ location: 'asc' }, { sortOrder: 'asc' }] });
    res.render('admin/navigation', { title: 'Navigation', items, saved: req.query.saved === '1' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
