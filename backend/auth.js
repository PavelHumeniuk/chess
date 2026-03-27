const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { findOrCreateUser } = require('./db');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /auth/google
 * Accepts the Google ID token credential from the frontend,
 * verifies it, creates/fetches the user, and returns a JWT.
 */
async function googleLogin(req, res) {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture: avatar } = payload;

    const user = findOrCreateUser(googleId, email, name, avatar);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
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
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { googleLogin, getMe };
