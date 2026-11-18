import { checkCredentials, signToken, sendError } from './_lib/auth.js';
import { getDb, logActivity } from './_lib/db.js';

// POST /api/login  { username, password }  ->  { token, user }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { username, password } = req.body || {};
    const user = checkCredentials(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    const token = signToken(user);
    try {
      const db = await getDb();
      await logActivity(db, { action: 'login', user: user.name, role: user.role });
    } catch { /* login still works if the DB is briefly unavailable */ }
    return res.status(200).json({ token, user });
  } catch (err) {
    return sendError(res, err);
  }
}