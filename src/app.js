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
  res.locals.navHeader = res.locals.navHeader || [];
  res.locals.navFooter = res.locals.navFooter || [];
  res.locals.currentUser = res.locals.currentUser || null;
  res.locals.csrfToken = res.locals.csrfToken || '';
  res.locals.appUrl = res.locals.appUrl || process.env.APP_URL || '';
  res.locals.format = format;
  res.locals.statusLabel = format.statusLabel;
  res.locals.nextAction = format.nextAction;
  res.locals.statusBadgeClass = format.statusBadgeClass;
  res.locals.formatMoney = format.formatMoney;
  res.locals.formatDateTime = format.formatDateTime;
  res.locals.preferenceEntries = format.preferenceEntries;
  res.locals.planTitle = format.planTitle;
}

function createApp() {
  const app = express();

  fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, '..', 'public', 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, '..', 'data', 'sessions'), { recursive: true });

  configurePassport();

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
    res.json({ ok: true });
  });

  app.use(createSessionMiddleware());
  app.use(passport.initialize());
  app.use(passport.session());

  const { generateToken, csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) =>
      (req.body && req.body._csrf) ||
      (req.query && req.query._csrf) ||
      req.headers['x-csrf-token'],
  });
  app.use(csrfSynchronisedProtection);

  app.use(async (req, res, next) => {
    try {
      const settingsRows = await prisma.siteSetting.findMany();
      const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
      const nav = await prisma.navItem.findMany({
        where: { visible: true },
        orderBy: [{ location: 'asc' }, { sortOrder: 'asc' }],
      });

      res.locals.siteName = settings.site_name || 'Destinations With Deanna';
      res.locals.siteTagline = settings.site_tagline || '';
      res.locals.settings = settings;
      res.locals.navHeader = nav.filter((n) => n.location === 'header');
      res.locals.navFooter = nav.filter((n) => n.location === 'footer');
      res.locals.currentUser = req.user || null;
      res.locals.csrfToken = req.csrfToken ? req.csrfToken() : generateToken(req);
      res.locals.appUrl = process.env.APP_URL || '';
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
