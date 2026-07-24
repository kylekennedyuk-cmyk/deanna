function ensureLoggedIn(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).render('pages/error', {
        title: 'Access denied',
        message: 'You do not have permission to view this page.',
        status: 403,
      });
    }
    return next();
  };
}

function guestOnly(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect(dashboardFor(req.user.role));
  }
  return next();
}

function dashboardFor(role) {
  if (role === 'admin') return '/admin';
  if (role === 'agent') return '/agent';
  return '/customer';
}

module.exports = { ensureLoggedIn, requireRole, guestOnly, dashboardFor };
