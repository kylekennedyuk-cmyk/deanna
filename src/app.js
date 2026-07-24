const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const passport = require('passport');
const csrf = require('csurf');

const { prisma } = require('./config/database');
const { configurePassport } = require('./config/passport');
const { createSessionMiddleware } = require('./config/session');

const authRoutes = require('./modules/auth/routes');
const cmsRoutes = require('./modules/cms/routes');
const planningRoutes = require('./modules/planning/routes');
const customerRoutes = require('./modules/customers/routes');
const agentRoutes = require('./modules/agents/routes');
const adminRoutes = require('./modules/admin/routes');

function createApp() {
  const app = express();

  fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, '..', 'public', 'uploads'), { recursive: true });

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
  app.use(createSessionMiddleware());
  app.use(passport.initialize());
  app.use(passport.session());

  const csrfProtection = csrf();
  app.use((req, res, next) => {
    // Skip CSRF for health checks
    if (req.path === '/health') return next();
    return csrfProtection(req, res, next);
  });

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
      res.locals.csrfToken = req.csrfToken ? req.csrfToken() : null;
      res.locals.appUrl = process.env.APP_URL || '';
      next();
    } catch (err) {
      next(err);
    }
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use(authRoutes);
  app.use(cmsRoutes);
  app.use('/planner', planningRoutes);
  app.use('/customer', customerRoutes);
  app.use('/agent', agentRoutes);
  app.use('/admin', adminRoutes);

  app.use((req, res) => {
    res.status(404).render('pages/error', {
      title: 'Not found',
      message: 'That page could not be found.',
      status: 404,
    });
  });

  app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
      return res.status(403).render('pages/error', {
        title: 'Form expired',
        message: 'Please go back and try again.',
        status: 403,
      });
    }
    console.error(err);
    res.status(500).render('pages/error', {
      title: 'Something went wrong',
      message: process.env.NODE_ENV === 'production' ? 'Please try again shortly.' : err.message,
      status: 500,
    });
  });

  return app;
}

module.exports = { createApp };
