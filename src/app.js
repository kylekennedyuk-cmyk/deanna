const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const passport = require('passport');
const { csrfSync } = require('csrf-sync');

const { prisma } = require('./config/database');
const { configurePassport } = require('./config/passport');
const { createSessionMiddleware } = require('./config/session');
const format = require('./utils/format');
const { emptyBadgeCounts, getBadgeCounts } = require('./utils/notifications');
const { resolveTcxConfig, renderTcxEmbedHtml } = require('./utils/tcx');
const { resolveWhatsappConfig } = require('./utils/whatsapp');

const authRoutes = require('./modules/auth/routes');
const cmsRoutes = require('./modules/cms/routes');
const planningRoutes = require('./modules/planning/routes');
const customerRoutes = require('./modules/customers/routes');
const agentRoutes = require('./modules/agents/routes');
const adminRoutes = require('./modules/admin/routes');

function applySafeLocals(res) {
  res.locals.siteName = res.locals.siteName || 'Destinations With Deanna';
  res.locals.siteTagline = res.locals.siteTagline || '';
  res.locals.settings = res.locals.settings || {};
  res.locals.tcx = res.locals.tcx || { show: false, enabled: false, hasChat: false };
  res.locals.tcxEmbedHtml = res.locals.tcxEmbedHtml || '';
  res.locals.whatsapp = res.locals.whatsapp || { show: false, enabled: false, href: '' };
  res.locals.navHeader = res.locals.navHeader || [];
  res.locals.navFooter = res.locals.navFooter || [];
  res.locals.currentUser = res.locals.currentUser || null;
  res.locals.csrfToken = res.locals.csrfToken || '';
  res.locals.appUrl = res.locals.appUrl || process.env.APP_URL || '';
  res.locals.badgeCounts = res.locals.badgeCounts || emptyBadgeCounts();
  res.locals.format = format;
  res.locals.statusLabel = format.statusLabel;
  res.locals.nextAction = format.nextAction;
  res.locals.statusBadgeClass = format.statusBadgeClass;
  res.locals.changeRequestStatusLabel = format.changeRequestStatusLabel;
  res.locals.changeRequestStatusBadgeClass = format.changeRequestStatusBadgeClass;
  res.locals.changeRequestAreaLabel = format.changeRequestAreaLabel;
  res.locals.formatMoney = format.formatMoney;
  res.locals.formatDateTime = format.formatDateTime;
  res.locals.preferenceEntries = format.preferenceEntries;
  res.locals.planTitle = format.planTitle;
  res.locals.stripMarginNotes = format.stripMarginNotes;
  res.locals.isBookedStatus = format.isBookedStatus;
  res.locals.canDownloadConfirmation = format.canDownloadConfirmation;
  res.locals.PLAN_STATUS_OPTIONS = format.PLAN_STATUS_OPTIONS;
  res.locals.CHANGE_REQUEST_STATUSES = format.CHANGE_REQUEST_STATUSES;
  res.locals.CHANGE_REQUEST_AREAS = format.CHANGE_REQUEST_AREAS;
}

function createApp() {
  let app;
  try {
    app = express();
  } catch (err) {
    console.error('[app] express() failed:', err && err.stack ? err.stack : err);
    throw err;
  }

  for (const dir of [
    path.join(__dirname, '..', 'data'),
    path.join(__dirname, '..', 'public', 'uploads'),
    path.join(__dirname, '..', 'data', 'sessions'),
  ]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.warn('[app] mkdir failed (continuing):', dir, err && err.message ? err.message : err);
    }
  }

  try {
    configurePassport();
  } catch (err) {
    console.error('[app] configurePassport() failed:', err && err.stack ? err.stack : err);
    throw err;
  }

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(methodOverride('_method'));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Health check before session/CSRF/DB so Plesk can probe the process.
  app.get('/health', (req, res) => {
    res.status(200).json({
      ok: true,
      uptime: Math.round(process.uptime()),
      node: process.version,
      passenger: typeof PhusionPassenger !== 'undefined',
    });
  });

  try {
    app.use(createSessionMiddleware());
  } catch (err) {
    console.error('[app] createSessionMiddleware() failed:', err && err.stack ? err.stack : err);
    throw err;
  }
  app.use(passport.initialize());
  app.use(passport.session());

  const { generateToken, csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) =>
      (req.body && req.body._csrf) ||
      (req.query && req.query._csrf) ||
      req.headers['x-csrf-token'],
  });
  app.use(csrfSynchronisedProtection);

  // Soft in-memory cache for site settings + nav (cuts SQLite churn on every request).
  // Fail-soft: if DB fails while cache is warm, serve stale; if cold, fall through to error handler.
  const SETTINGS_NAV_TTL_MS = 45 * 1000;
  let settingsNavCache = { expiresAt: 0, settings: null, nav: null };

  async function loadSettingsAndNav() {
    const now = Date.now();
    if (
      settingsNavCache.settings &&
      settingsNavCache.nav &&
      now < settingsNavCache.expiresAt
    ) {
      return { settings: settingsNavCache.settings, nav: settingsNavCache.nav };
    }

    try {
      const settingsRows = await prisma.siteSetting.findMany();
      const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
      const nav = await prisma.navItem.findMany({
        where: { visible: true },
        orderBy: [{ location: 'asc' }, { sortOrder: 'asc' }],
      });
      settingsNavCache = {
        expiresAt: now + SETTINGS_NAV_TTL_MS,
        settings,
        nav,
      };
      return { settings, nav };
    } catch (err) {
      if (settingsNavCache.settings && settingsNavCache.nav) {
        console.warn(
          '[app] settings/nav query failed — serving stale cache:',
          err && err.message ? err.message : err
        );
        return { settings: settingsNavCache.settings, nav: settingsNavCache.nav };
      }
      throw err;
    }
  }

  app.use(async (req, res, next) => {
    try {
      const { settings, nav } = await loadSettingsAndNav();

      res.locals.siteName = settings.site_name || 'Destinations With Deanna';
      res.locals.siteTagline = settings.site_tagline || '';
      res.locals.settings = settings;
      try {
        res.locals.tcx = resolveTcxConfig(settings);
        res.locals.tcxEmbedHtml = renderTcxEmbedHtml(res.locals.tcx);
      } catch (tcxErr) {
        console.warn('[app] 3CX config failed:', tcxErr && tcxErr.message ? tcxErr.message : tcxErr);
        res.locals.tcx = resolveTcxConfig(undefined);
        res.locals.tcxEmbedHtml = '';
      }
      try {
        res.locals.whatsapp = resolveWhatsappConfig(settings);
      } catch (waErr) {
        console.warn('[app] WhatsApp config failed:', waErr && waErr.message ? waErr.message : waErr);
        res.locals.whatsapp = resolveWhatsappConfig(undefined);
      }
      res.locals.navHeader = nav.filter((n) => n.location === 'header');
      res.locals.navFooter = nav.filter((n) => n.location === 'footer');
      res.locals.currentUser = req.user || null;
      res.locals.csrfToken = req.csrfToken ? req.csrfToken() : generateToken(req);
      res.locals.appUrl = process.env.APP_URL || '';
      // Badge counts must never break page rendering (schema drift / IMAP / SQLITE_BUSY).
      // Mailbox IMAP is NEVER opened here — only a warm in-process cache (else 0).
      // IMAP refresh happens on /agent/mailbox routes via refreshBadgeCounts({ refreshMailbox: true }).
      try {
        res.locals.badgeCounts = req.user
          ? await getBadgeCounts(req.user, { refreshMailbox: false })
          : emptyBadgeCounts();
      } catch (badgeErr) {
        console.warn('[app] badge middleware failed:', badgeErr && badgeErr.message ? badgeErr.message : badgeErr);
        res.locals.badgeCounts = emptyBadgeCounts();
      }
      applySafeLocals(res);
      next();
    } catch (err) {
      applySafeLocals(res);
      next(err);
    }
  });

  app.use((req, res, next) => {
    const settings = res.locals.settings || {};
    const role = req.user && req.user.role;
    const isStaff = role === 'admin' || role === 'agent';
    const alwaysAllowed = ['/login', '/logout', '/forgot-password'];

    if (
      settings.maintenance_mode === 'true' &&
      !isStaff &&
      !alwaysAllowed.includes(req.path) &&
      !req.path.startsWith('/admin') &&
      !req.path.startsWith('/reset-password') &&
      !req.path.startsWith('/setup-account')
    ) {
      return res.status(503).render('pages/maintenance', {
        title: 'Back shortly',
      });
    }

    if (settings.planner_enabled === 'false' && req.path.startsWith('/planner') && !isStaff) {
      return res.status(403).render('pages/error', {
        title: 'Planner unavailable',
        message:
          'The holiday planner is temporarily closed. Please use the contact page and Deanna will get back to you.',
        status: 403,
      });
    }

    return next();
  });

  app.use(authRoutes);
  app.use(cmsRoutes);
  app.use('/planner', planningRoutes);
  app.use('/customer', customerRoutes);
  app.use('/agent', agentRoutes);
  app.use('/admin', adminRoutes);

  app.use((req, res) => {
    applySafeLocals(res);
    res.status(404).render('pages/error', {
      title: 'Not found',
      message: 'That page could not be found.',
      status: 404,
    });
  });

  app.use((err, req, res, next) => {
    applySafeLocals(res);
    console.error(err);

    if (err.code === 'EBADCSRFTOKEN') {
      return res.status(403).render('pages/error', {
        title: 'Form expired',
        message: 'Please go back and try again.',
        status: 403,
      });
    }

    const isDbError =
      err.code === 'P1001' ||
      err.code === 'P1003' ||
      err.code === 'P2021' ||
      /database|sqlite|prisma/i.test(String(err.message || ''));

    const message = isDbError
      ? 'The website database is not ready yet. In Plesk Node.js, run the script named "deploy", then Restart App.'
      : process.env.NODE_ENV === 'production'
        ? 'Please try again shortly. If this continues, check the Node.js logs in Plesk.'
        : err.message;

    try {
      return res.status(500).render('pages/error', {
        title: 'Something went wrong',
        message,
        status: 500,
      });
    } catch (renderErr) {
      console.error(renderErr);
      return res
        .status(500)
        .type('html')
        .send(
          `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:40px"><h1>Something went wrong</h1><p>${message}</p></body></html>`
        );
    }
  });

  return app;
}

module.exports = { createApp };
