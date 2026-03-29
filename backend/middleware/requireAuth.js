const jwt = require('jsonwebtoken');
const { readCookieToken } = require('../auth');

/**
 * Middleware that verifies a Bearer JWT from the Authorization header.
 * Attaches req.user = { id, email, name, avatar } on success.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const token = bearer || readCookieToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
