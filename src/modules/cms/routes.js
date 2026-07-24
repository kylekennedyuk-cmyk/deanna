const express = require('express');
const { prisma } = require('../../config/database');

const router = express.Router();

function parseSections(page) {
  try {
    return JSON.parse(page.sections || '[]');
  } catch {
    return [];
  }
}

router.get('/', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { slug: 'home' } });
    res.render('pages/home', {
      title: (page && page.seoTitle) || 'Destinations With Deanna',
      seoDesc: page && page.seoDesc,
      sections: page ? parseSections(page) : [],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/about', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { slug: 'about' } });
    res.render('pages/simple', {
      title: (page && page.title) || 'About Deanna',
      seoDesc: page && page.seoDesc,
      sections: page ? parseSections(page) : [],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/disneyland-paris', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { slug: 'disneyland-paris' } });
    res.render('pages/guide', {
      title: (page && page.title) || 'Disneyland Paris',
      seoDesc: page && page.seoDesc,
      sections: page ? parseSections(page) : [],
      links: [
        { href: '/disneyland-paris/hotels', label: 'Hotels' },
        { href: '/disneyland-paris/dining', label: 'Dining' },
        { href: '/disneyland-paris/things-to-do', label: 'Things to do' },
        { href: '/planner', label: 'Start planning' },
      ],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/disneyland-paris/hotels', (req, res) => {
  res.render('pages/guide', {
    title: 'Hotels',
    seoDesc: 'Disneyland Paris hotel guidance from Destinations With Deanna.',
    sections: [
      {
        type: 'intro',
        title: 'Hotels',
        text: 'Disney hotels, partner hotels, and what suits different budgets and travel styles — curated with care.',
      },
    ],
    links: [{ href: '/planner', label: 'Get a personal hotel recommendation' }],
  });
});

router.get('/disneyland-paris/dining', (req, res) => {
  res.render('pages/guide', {
    title: 'Dining',
    seoDesc: 'Dining tips for Disneyland Paris.',
    sections: [
      {
        type: 'intro',
        title: 'Dining',
        text: 'Character dining, quick service, and special occasion restaurants — planned around your day.',
      },
    ],
    links: [{ href: '/planner', label: 'Include dining in your plan' }],
  });
});

router.get('/disneyland-paris/things-to-do', (req, res) => {
  res.render('pages/guide', {
    title: 'Things to do',
    seoDesc: 'Parks, shows, and experiences at Disneyland Paris.',
    sections: [
      {
        type: 'intro',
        title: 'Things to do',
        text: 'Parks, shows, character meets, and seasonal experiences — paced for your party.',
      },
    ],
    links: [{ href: '/planner', label: 'Build your itinerary with Deanna' }],
  });
});

router.get('/planning-advice', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { slug: 'planning-advice' } });
    res.render('pages/simple', {
      title: (page && page.title) || 'Planning Advice',
      seoDesc: page && page.seoDesc,
      sections: page ? parseSections(page) : [],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/offers', async (req, res, next) => {
  try {
    const deals = await prisma.deal.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
    res.render('pages/offers', {
      title: 'Offers & Deals',
      seoDesc: 'Current Disneyland Paris offers from Destinations With Deanna.',
      deals,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/contact', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { slug: 'contact' } });
    res.render('pages/contact', {
      title: (page && page.title) || 'Contact',
      seoDesc: page && page.seoDesc,
      sections: page ? parseSections(page) : [],
      sent: req.query.sent === '1',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/contact', async (req, res, next) => {
  try {
    // Placeholder: wire to email/notifications module later
    console.log('[contact]', {
      name: req.body.name,
      email: req.body.email,
      message: req.body.message,
    });
    res.redirect('/contact?sent=1');
  } catch (err) {
    next(err);
  }
});

router.get('/privacy', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { slug: 'privacy' } });
    res.render('pages/simple', {
      title: (page && page.title) || 'Privacy',
      seoDesc: page && page.seoDesc,
      sections: page ? parseSections(page) : [],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/pages/:slug', async (req, res, next) => {
  try {
    const page = await prisma.page.findFirst({
      where: { slug: req.params.slug, published: true },
    });
    if (!page) return res.status(404).render('pages/error', { title: 'Not found', message: 'Page not found.', status: 404 });
    res.render('pages/simple', {
      title: page.title,
      seoDesc: page.seoDesc,
      sections: parseSections(page),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
