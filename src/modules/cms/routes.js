const express = require('express');
const { prisma } = require('../../config/database');
const { sendNotification } = require('../../config/email');
const { getSettings } = require('../../config/settings');
const { pages: defaultPages } = require('../../content/publicPages');
const { resolveHomeSections } = require('../../content/homeDefaults');

const router = express.Router();

const RICH_SECTION_TYPES = new Set([
  'hero',
  'cards',
  'split',
  'hotelGrid',
  'timeline',
  'tips',
  'faq',
  'cta',
  'intro',
  'featureCards',
  'highlights',
  'testimonials',
  'why',
  'process',
]);

function parseSections(page) {
  try {
    return JSON.parse(page.sections || '[]');
  } catch {
    return [];
  }
}

function hasRichSections(sections) {
  return (sections || []).some((section) => RICH_SECTION_TYPES.has(section.type) && section.type !== 'intro');
}

async function getPage(slug) {
  const stored = await prisma.page.findUnique({ where: { slug } });
  const fallback = defaultPages[slug];

  if (stored) {
    const sections = parseSections(stored);
    // Seed stubs used type "intro" only — fall back to full default content so
    // hotels/dining/guide sections still appear until content:sync is run.
    if (!hasRichSections(sections) && fallback && Array.isArray(fallback.sections)) {
      return {
        ...stored,
        title: stored.title || fallback.title,
        seoTitle: stored.seoTitle || fallback.seoTitle,
        seoDesc: stored.seoDesc || fallback.seoDesc,
        sections: fallback.sections,
      };
    }
    return { ...stored, sections };
  }

  return fallback ? { slug, ...fallback } : null;
}

async function renderRichPage(req, res, next, slug) {
  try {
    const page = await getPage(slug);
    if (!page) {
      return res.status(404).render('pages/error', {
        title: 'Not found',
        message: 'Page not found.',
        status: 404,
      });
    }
    return res.render('pages/rich', {
      title: page.title,
      seoDesc: page.seoDesc,
      sections: page.sections,
    });
  } catch (err) {
    return next(err);
  }
}

router.get('/', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { slug: 'home' } });
    const storedSections = page ? parseSections(page) : [];
    res.render('pages/home', {
      title: (page && page.seoTitle) || 'Destinations With Deanna',
      seoDesc: page && page.seoDesc,
      sections: resolveHomeSections(storedSections),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/about', (req, res, next) => renderRichPage(req, res, next, 'about'));

router.get('/disneyland-paris', (req, res, next) =>
  renderRichPage(req, res, next, 'disneyland-paris')
);

router.get('/disneyland-paris/hotels', (req, res, next) =>
  renderRichPage(req, res, next, 'hotels')
);

router.get('/disneyland-paris/dining', (req, res, next) =>
  renderRichPage(req, res, next, 'dining')
);

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

router.get('/planning-advice', (req, res, next) =>
  renderRichPage(req, res, next, 'planning-advice')
);

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
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const message = String(req.body.message || '').trim();
    if (!name || !email || !message) {
      return res.status(400).render('pages/error', {
        title: 'Please complete the form',
        message: 'Name, email and message are required.',
        status: 400,
      });
    }
    const settings = await getSettings();
    const recipient =
      settings.support_email ||
      process.env.SUPPORT_EMAIL ||
      'hello@destinationswithdeanna.com';
    await sendNotification('contact', {
      to: recipient,
      values: { customerName: name },
      body: `Email: ${email}\n\n${message}`,
      buttonLabel: 'Open the website',
      buttonUrl: process.env.APP_URL || 'http://localhost:3000',
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
    res.render('pages/rich', {
      title: page.title,
      seoDesc: page.seoDesc,
      sections: parseSections(page),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
