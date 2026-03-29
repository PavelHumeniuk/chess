const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { findOrCreateUser } = require('./db');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const COOKIE_NAME = 'chess_token';

function readCookieToken(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = cookieHeader.split(';');
  for (const item of cookies) {
    const [rawName, ...valueParts] = item.trim().split('=');
    if (rawName === COOKIE_NAME) {
      return decodeURIComponent(valueParts.join('='));
    }
  }
  return null;
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

/**
 * POST /auth/google
 * Accepts the Google ID token credential from the frontend,
 * verifies it, creates/fetches the user, and returns a JWT.
 */
async function googleLogin(req, res) {
  try {
    const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.JWT_SECRET) {
      console.error('Google auth misconfiguration: missing GOOGLE_CLIENT_ID or JWT_SECRET');
      return res.status(500).json({ error: 'Authentication service misconfigured' });
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const { sub: googleId, email, name, picture: avatar } = payload;

    const user = findOrCreateUser(googleId, email, name, avatar);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    setAuthCookie(res, token);
    return res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
  } catch (err) {
    console.error('Google auth error:', err);
    return res.status(401).json({ error: 'Invalid Google token' });
  }
}

/**
 * GET /auth/me
 * Returns the current user from their JWT. Requires Authorization: Bearer <token>.
 */
function getMe(req, res) {
  const authHeader = req.headers['authorization'];
  const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const token = bearer || readCookieToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function logout(_req, res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });
  return res.json({ ok: true });
}

module.exports = { googleLogin, getMe, logout, readCookieToken };
