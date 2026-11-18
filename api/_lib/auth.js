import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/*
  Two roles:
    uploader -> uploads / replaces / removes Excel files, can view dashboards
    admin    -> view-only dashboards of what has been uploaded
  Credentials come from Vercel environment variables:
    UPLOADER_USERNAME, UPLOADER_PASSWORD, UPLOADER_NAME (optional display name)
    ADMIN_USERNAME,    ADMIN_PASSWORD,    ADMIN_NAME    (optional display name)
    JWT_SECRET (long random string)
*/

const TOKEN_TTL = '12h';

function users() {
  return [
    {
      username: process.env.UPLOADER_USERNAME,
      password: process.env.UPLOADER_PASSWORD,
      role: 'uploader',
      name: process.env.UPLOADER_NAME || 'Uploader',
    },
    {
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
      role: 'admin',
      name: process.env.ADMIN_NAME || 'Admin',
    },
  ].filter((u) => u.username && u.password);
}

// constant-time compare (hash first so lengths always match)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET is missing or too short');
  return s;
}

export function checkCredentials(username, password) {
  const u = users().find((x) => x.username.toLowerCase() === String(username || '').trim().toLowerCase());
  if (!u || !safeEqual(u.password, password || '')) return null;
  return { username: u.username, role: u.role, name: u.name };
}

export function signToken(user) {
  return jwt.sign({ sub: user.username, role: user.role, name: user.name }, secret(), { expiresIn: TOKEN_TTL });
}

/* Returns the user or sends 401/403 and returns null */
export function requireUser(req, res, roles) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Not signed in' }); return null; }
  let payload;
  try {
    payload = jwt.verify(token, secret());
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again' });
    return null;
  }
  const user = { username: payload.sub, role: payload.role, name: payload.name };
  if (roles && !roles.includes(user.role)) {
    res.status(403).json({ error: 'Your role cannot do this' });
    return null;
  }
  return user;
}

export function sendError(res, err) {
  console.error(err);
  res.status(500).json({ error: err?.message || 'Server error' });
}