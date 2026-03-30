import { readCookieToken } from '../auth';
import type { AuthUser, NextFunction, RequestLike, ResponseLike } from '../types';

const jwt = require('jsonwebtoken') as {
  verify(token: string, secret: string): AuthUser;
};

/**
 * Middleware that verifies a Bearer JWT from the Authorization header.
 * Attaches req.user = { id, email, name, avatar } on success.
 */
export default function requireAuth(req: RequestLike, res: ResponseLike, next: NextFunction): ResponseLike | void {
  const authHeader = req.headers?.authorization;
  const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;
  const token = bearer || readCookieToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET ?? '');
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
