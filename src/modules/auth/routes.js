const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../../config/database');
const { guestOnly, dashboardFor, ensureLoggedIn } = require('../../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again shortly.',
});

router.get('/login', guestOnly, (req, res) => {
  res.render('auth/login', {
    title: 'Login',
    error: null,
  });
});

router.post(
  '/login',
  guestOnly,
  authLimiter,
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render('auth/login', {
        title: 'Login',
        error: errors.array()[0].msg,
      });
    }

    passport.authenticate('local', (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).render('auth/login', {
          title: 'Login',
          error: (info && info.message) || 'Invalid username or password.',
        });
      }

      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const redirectTo = req.session.returnTo || dashboardFor(user.role);
        delete req.session.returnTo;
        return res.redirect(redirectTo);
      });
    })(req, res, next);
  }
);

router.get('/register', guestOnly, (req, res) => {
  res.render('auth/register', {
    title: 'Create account',
    error: null,
  });
});

router.post(
  '/register',
  guestOnly,
  authLimiter,
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).render('auth/register', {
          title: 'Create account',
          error: errors.array()[0].msg,
        });
      }

      const email = String(req.body.email).trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(400).render('auth/register', {
          title: 'Create account',
          error: 'An account with that email already exists.',
        });
      }

      const passwordHash = await bcrypt.hash(req.body.password, 12);
      const user = await prisma.user.create({
        data: {
          name: req.body.name.trim(),
          email,
          passwordHash,
          role: 'customer',
          phone: req.body.phone ? String(req.body.phone).trim() : null,
        },
      });

      req.logIn(user, (err) => {
        if (err) return next(err);
        return res.redirect('/customer');
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/logout', ensureLoggedIn, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});

module.exports = router;
