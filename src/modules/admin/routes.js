const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { prisma } = require('../../config/database');
const { createTransport, closeCachedTransport, sendMail, normalizeSmtpHost } = require('../../config/email');
const { encryptSecret, decryptSecret, getSettings, setSettings } = require('../../config/settings');
const { requireRole } = require('../../middleware/auth');
const { resolveHomeSections } = require('../../content/homeDefaults');
const { CHANGE_REQUEST_STATUSES } = require('../../utils/format');
const {
  uploadDirectory,
  mediaUpload,
  createMediaFromUpload,
  jsonUploadHandler,
  listMediaJson,
} = require('../../utils/mediaUpload');

const router = express.Router();
router.use(requireRole(['admin']));

router.get('/', async (req, res, next) => {
  try {
    const [users, plans, pages, deals, changeRequests] = await Promise.all([
      prisma.user.count(),
      prisma.holidayPlan.count(),
      prisma.page.count(),
      prisma.deal.count({ where: { active: true } }),
      prisma.changeRequest.count({ where: { status: { in: ['open', 'in_progress'] } } }),
    ]);
    res.render('admin/dashboard', {
      title: 'Admin',
      stats: { users, plans, pages, deals, changeRequests },
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
    const [page, media] = await Promise.all([
      prisma.page.findUnique({ where: { id: Number(req.params.id) } }),
      prisma.media.findMany({ orderBy: { uploadedAt: 'desc' } }),
    ]);
    if (!page) {
      return res.status(404).render('pages/error', { title: 'Not found', message: 'Page not found.', status: 404 });
    }
    let sections = [];
    try {
      sections = JSON.parse(page.sections || '[]');
    } catch {
      sections = [];
    }
    if (page.slug === 'home') {
      sections = resolveHomeSections(sections);
    }
    res.render('admin/page-edit', {
      title: `Edit ${page.title}`,
      page,
      sections,
      media,
      error: null,
      saved: req.query.saved === '1',
      editorPaths: {
        list: '/admin/pages',
        listLabel: 'All pages',
        save: `/admin/pages/${page.id}`,
        preview: `/admin/pages/${page.id}/preview`,
        mediaUpload: '/admin/media/upload',
        mediaJson: '/admin/media/json',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/pages/:id/preview', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { id: Number(req.params.id) } });
    if (!page) {
      return res.status(404).render('pages/error', {
        title: 'Not found',
        message: 'Page not found.',
        status: 404,
      });
    }
    let sections = [];
    try {
      sections = JSON.parse(page.sections || '[]');
    } catch {
      sections = [];
    }
    if (page.slug === 'home') {
      sections = resolveHomeSections(sections);
    }
    return res.render(page.slug === 'home' ? 'pages/home' : 'pages/rich', {
      title: `${page.title} preview`,
      seoDesc: page.seoDesc,
      sections,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/pages/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    let sections;
    try {
      sections = JSON.parse(String(req.body.sections || '[]'));
      if (!Array.isArray(sections)) throw new Error('Sections must be an array');
    } catch {
      const [page, media] = await Promise.all([
        prisma.page.findUnique({ where: { id } }),
        prisma.media.findMany({ orderBy: { uploadedAt: 'desc' } }),
      ]);
      return res.status(400).render('admin/page-edit', {
        title: `Edit ${page ? page.title : 'page'}`,
        page,
        sections: [],
        media,
        error: 'The page sections could not be saved. Please review the section fields.',
        saved: false,
        editorPaths: {
          list: '/admin/pages',
          listLabel: 'All pages',
          save: `/admin/pages/${id}`,
          preview: `/admin/pages/${id}/preview`,
          mediaUpload: '/admin/media/upload',
          mediaJson: '/admin/media/json',
        },
      });
    }
    await prisma.page.update({
      where: { id },
      data: {
        title: String(req.body.title || '').trim(),
        seoTitle: req.body.seoTitle ? String(req.body.seoTitle).trim() : null,
        seoDesc: req.body.seoDesc ? String(req.body.seoDesc).trim() : null,
        sections: JSON.stringify(sections),
        published: req.body.published === 'on',
      },
    });
    res.redirect(`/admin/pages/${id}?saved=1`);
  } catch (err) {
    next(err);
  }
});

async function renderUsersPage(res, extras = {}) {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  return res.render('admin/users', {
    title: 'Users',
    users,
    saved: false,
    passwordSaved: false,
    emailSaved: false,
    error: null,
    ...extras,
  });
}

router.get('/users', async (req, res, next) => {
  try {
    await renderUsersPage(res, {
      saved: req.query.saved === '1',
      passwordSaved: req.query.password === '1',
      emailSaved: req.query.email === '1',
    });
  } catch (err) {
    next(err);
  }
});

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/users', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const username = req.body.username
      ? String(req.body.username).trim().toLowerCase()
      : email;
    const password = String(req.body.password || '');
    if (!email || !isValidEmail(email) || !password || password.length < 8) {
      return renderUsersPage(res.status(400), {
        error: 'Valid email and password (min 8 characters) are required.',
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
    if (err.code === 'P2002') {
      return renderUsersPage(res.status(400), {
        error: 'That email or username is already in use.',
      });
    }
    next(err);
  }
});

router.post('/users/:id/email', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!userId || !email || !isValidEmail(email)) {
      return renderUsersPage(res.status(400), {
        error: 'A valid email address is required.',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return renderUsersPage(res.status(404), {
        error: 'User not found.',
      });
    }

    if (user.email === email) {
      return res.redirect('/admin/users?email=1');
    }

    const data = { email };
    // Keep login working: username often defaults to email on create/setup.
    const oldUsername = (user.username || '').trim().toLowerCase();
    if (!oldUsername || oldUsername === user.email.toLowerCase()) {
      const usernameTaken = await prisma.user.findFirst({
        where: { username: email, NOT: { id: userId } },
      });
      if (!usernameTaken) {
        data.username = email;
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data,
    });
    res.redirect('/admin/users?email=1');
  } catch (err) {
    if (err.code === 'P2002') {
      return renderUsersPage(res.status(400), {
        error: 'That email is already in use by another account.',
      });
    }
    next(err);
  }
});

router.post('/users/:id/password', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const password = String(req.body.password || '');
    if (!userId || password.length < 8) {
      return renderUsersPage(res.status(400), {
        error: 'Password must be at least 8 characters.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    res.redirect('/admin/users?password=1');
  } catch (err) {
    next(err);
  }
});

router.get('/deals', async (req, res, next) => {
  try {
    const deals = await prisma.deal.findMany({ orderBy: { createdAt: 'desc' } });
    res.render('admin/deals', {
      title: 'Deals',
      deals,
      saved: req.query.saved === '1',
      deleted: req.query.deleted === '1',
    });
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

router.post('/deals/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.deal.update({
      where: { id },
      data: {
        title: String(req.body.title || '').trim(),
        description: String(req.body.description || '').trim(),
        price: req.body.price !== '' && req.body.price != null ? Number(req.body.price) : null,
        active: req.body.active === 'on',
      },
    });
    res.redirect('/admin/deals?saved=1');
  } catch (err) {
    next(err);
  }
});

router.post('/deals/:id/toggle', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) {
      return res.status(404).render('pages/error', {
        title: 'Not found',
        message: 'Deal not found.',
        status: 404,
      });
    }
    await prisma.deal.update({
      where: { id },
      data: { active: !deal.active },
    });
    res.redirect('/admin/deals?saved=1');
  } catch (err) {
    next(err);
  }
});

router.post('/deals/:id/delete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.deal.delete({ where: { id } });
    res.redirect('/admin/deals?deleted=1');
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
    const keys = [
      'site_name',
      'site_tagline',
      'support_email',
      'phone',
      'address',
      'facebook_url',
      'instagram_url',
      'tiktok_url',
      'logo_url',
      'logo_mode',
      'logo_height',
      'logo_max_width',
      'logo_height_mobile',
      'logo_max_width_mobile',
      'footer_intro',
      'abta_number',
      'atol_number',
      'primary_colour',
      'secondary_colour',
      'background_colour',
      'header_background',
      'planner_enabled',
      'maintenance_mode',
      'tcx_enabled',
      'tcx_phonesystem_url',
      'tcx_party',
      'tcx_embed_snippet',
      'whatsapp_enabled',
      'whatsapp_number',
      'whatsapp_message',
    ];
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

router.post('/navigation', async (req, res, next) => {
  try {
    await prisma.navItem.create({
      data: {
        label: String(req.body.label || '').trim(),
        href: String(req.body.href || '/').trim(),
        location: req.body.location === 'footer' ? 'footer' : 'header',
        sortOrder: Number(req.body.sortOrder || 0),
        visible: req.body.visible === 'on',
      },
    });
    return res.redirect('/admin/navigation?saved=1');
  } catch (err) {
    return next(err);
  }
});

router.post('/navigation/:id', async (req, res, next) => {
  try {
    await prisma.navItem.update({
      where: { id: Number(req.params.id) },
      data: {
        label: String(req.body.label || '').trim(),
        href: String(req.body.href || '/').trim(),
        location: req.body.location === 'footer' ? 'footer' : 'header',
        sortOrder: Number(req.body.sortOrder || 0),
        visible: req.body.visible === 'on',
      },
    });
    return res.redirect('/admin/navigation?saved=1');
  } catch (err) {
    return next(err);
  }
});

router.post('/navigation/:id/delete', async (req, res, next) => {
  try {
    await prisma.navItem.delete({ where: { id: Number(req.params.id) } });
    return res.redirect('/admin/navigation?saved=1');
  } catch (err) {
    return next(err);
  }
});

router.get('/media/json', listMediaJson);
router.post('/media/upload', jsonUploadHandler);

router.get('/media', async (req, res, next) => {
  try {
    const media = await prisma.media.findMany({
      orderBy: [{ folder: 'asc' }, { uploadedAt: 'desc' }],
    });
    return res.render('admin/media', {
      title: 'Media library',
      media,
      saved: req.query.saved === '1',
      error: null,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/media', (req, res, next) => {
  mediaUpload.single('image')(req, res, async (uploadError) => {
    if (uploadError) {
      try {
        const media = await prisma.media.findMany({ orderBy: { uploadedAt: 'desc' } });
        return res.status(400).render('admin/media', {
          title: 'Media library',
          media,
          saved: false,
          error: uploadError.message,
        });
      } catch (err) {
        return next(err);
      }
    }

    try {
      await createMediaFromUpload(req);
      return res.redirect('/admin/media?saved=1');
    } catch (err) {
      if (err.status === 400) {
        const media = await prisma.media.findMany({ orderBy: { uploadedAt: 'desc' } });
        return res.status(400).render('admin/media', {
          title: 'Media library',
          media,
          saved: false,
          error: err.message,
        });
      }
      return next(err);
    }
  });
});

router.post('/media/:id', async (req, res, next) => {
  try {
    await prisma.media.update({
      where: { id: Number(req.params.id) },
      data: {
        alt: req.body.alt ? String(req.body.alt).trim() : null,
        caption: req.body.caption ? String(req.body.caption).trim() : null,
        folder: req.body.folder ? String(req.body.folder).trim() : 'General',
      },
    });
    return res.redirect('/admin/media?saved=1');
  } catch (err) {
    return next(err);
  }
});

router.post('/media/:id/delete', async (req, res, next) => {
  try {
    const item = await prisma.media.delete({ where: { id: Number(req.params.id) } });
    if (item.url.startsWith('/uploads/')) {
      const filePath = path.join(uploadDirectory, path.basename(item.url));
      fs.unlink(filePath, () => {});
    }
    return res.redirect('/admin/media?saved=1');
  } catch (err) {
    return next(err);
  }
});

router.get('/notifications', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const displayed = {
      ...settings,
      smtp_host: normalizeSmtpHost(settings.smtp_host || '') || settings.smtp_host || '',
    };
    const decryptedPass = decryptSecret(settings.smtp_pass || '');
    const passBroken =
      Boolean(settings.smtp_pass) &&
      String(settings.smtp_pass).startsWith('enc:v1:') &&
      !decryptedPass &&
      !process.env.SMTP_PASS;
    return res.render('admin/notifications', {
      title: 'Email & notifications',
      settings: displayed,
      passwordConfigured: Boolean(decryptedPass || process.env.SMTP_PASS),
      passwordBroken: passBroken,
      saved: req.query.saved === '1',
      tested: req.query.tested === '1',
      error: req.query.error || null,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/notifications', async (req, res, next) => {
  try {
    const port = String(req.body.smtp_port || '587').trim();
    const secureChecked = req.body.smtp_secure === 'on' || port === '465';
    const values = {
      email_notifications_enabled:
        req.body.email_notifications_enabled === 'on' ? 'true' : 'false',
      smtp_host: normalizeSmtpHost(req.body.smtp_host || ''),
      smtp_port: port,
      smtp_secure: secureChecked ? 'true' : 'false',
      smtp_user: String(req.body.smtp_user || '').trim(),
      smtp_from_name: String(req.body.smtp_from_name || '').trim(),
      smtp_from_email: String(req.body.smtp_from_email || '').trim(),
      smtp_reply_to: String(req.body.smtp_reply_to || '').trim(),
      // Keep IMAP aligned with SMTP host when using the same provider
      imap_host: normalizeSmtpHost(req.body.smtp_host || process.env.IMAP_HOST || ''),
      imap_user: String(req.body.smtp_user || '').trim(),
      email_new_request_subject: String(req.body.email_new_request_subject || '').trim(),
      email_new_request_heading: String(req.body.email_new_request_heading || '').trim(),
      email_new_request_intro: String(req.body.email_new_request_intro || '').trim(),
      email_customer_confirmation_subject: String(req.body.email_customer_confirmation_subject || '').trim(),
      email_customer_confirmation_heading: String(req.body.email_customer_confirmation_heading || '').trim(),
      email_customer_confirmation_intro: String(req.body.email_customer_confirmation_intro || '').trim(),
      email_new_message_subject: String(req.body.email_new_message_subject || '').trim(),
      email_new_message_heading: String(req.body.email_new_message_heading || '').trim(),
      email_new_message_intro: String(req.body.email_new_message_intro || '').trim(),
      email_status_update_subject: String(req.body.email_status_update_subject || '').trim(),
      email_status_update_heading: String(req.body.email_status_update_heading || '').trim(),
      email_status_update_intro: String(req.body.email_status_update_intro || '').trim(),
      email_password_reset_subject: String(req.body.email_password_reset_subject || '').trim(),
      email_password_reset_heading: String(req.body.email_password_reset_heading || '').trim(),
      email_password_reset_intro: String(req.body.email_password_reset_intro || '').trim(),
      email_contact_subject: String(req.body.email_contact_subject || '').trim(),
      email_contact_heading: String(req.body.email_contact_heading || '').trim(),
      email_contact_intro: String(req.body.email_contact_intro || '').trim(),
    };

    if (req.body.smtp_pass) {
      values.smtp_pass = encryptSecret(req.body.smtp_pass);
      values.imap_pass = values.smtp_pass;
    }
    await setSettings(values);
    closeCachedTransport();
    return res.redirect('/admin/notifications?saved=1');
  } catch (err) {
    return next(err);
  }
});

router.post('/notifications/test', async (req, res, next) => {
  try {
    const destination = String(req.body.test_email || req.user.email).trim();
    const { transport, settings, reason } = await createTransport();
    if (!transport) {
      return res.redirect(
        `/admin/notifications?error=${encodeURIComponent(reason || 'SMTP is not configured.')}`
      );
    }

    // Cap wait so the admin UI never hangs for 20+ seconds.
    const result = await Promise.race([
      sendMail({
        to: destination,
        subject: 'Destinations With Deanna email test',
        html: `<div style="font-family:Arial,sans-serif;padding:32px"><h1 style="color:#1a2b40">Email is working</h1><p>Your website can now send planning and portal notifications via ${settings.host}:${settings.port}.</p></div>`,
        text: `Email is working. Your website can now send planning and portal notifications via ${settings.host}:${settings.port}.`,
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Connection timed out talking to ${settings.host}:${settings.port}. Check the host is prime.ax (not prime.sx), port 465 with SSL, and that the server can reach outbound SMTP.`
            )
          );
        }, 12000);
      }),
    ]);

    if (result && result.skipped) {
      return res.redirect(
        `/admin/notifications?error=${encodeURIComponent(result.reason || 'SMTP is not configured.')}`
      );
    }
    return res.redirect('/admin/notifications?tested=1');
  } catch (err) {
    const detail = [err.responseCode, err.response, err.message]
      .filter(Boolean)
      .map(String)
      .filter((part, index, arr) => arr.indexOf(part) === index)
      .join(' — ');
    console.error('[email test failed]', detail);
    return res.redirect(`/admin/notifications?error=${encodeURIComponent(detail || 'Test email failed.')}`);
  }
});

router.get('/change-requests', async (req, res, next) => {
  try {
    const requests = await prisma.changeRequest.findMany({
      include: { requester: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.render('admin/change-requests', {
      title: 'Site change requests',
      requests,
      statuses: CHANGE_REQUEST_STATUSES,
      saved: req.query.saved === '1',
      deleted: req.query.deleted === '1',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/change-requests/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || '').trim();
    if (!id || !CHANGE_REQUEST_STATUSES.includes(status)) {
      return res.redirect('/admin/change-requests');
    }
    const resolutionNote = String(req.body.resolutionNote || '').trim();
    await prisma.changeRequest.update({
      where: { id },
      data: {
        status,
        resolutionNote: resolutionNote || null,
      },
    });
    res.redirect('/admin/change-requests?saved=1');
  } catch (err) {
    next(err);
  }
});

router.post('/change-requests/:id/delete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.changeRequest.delete({ where: { id } });
    res.redirect('/admin/change-requests?deleted=1');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
