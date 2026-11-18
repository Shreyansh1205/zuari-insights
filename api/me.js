import { requireUser } from './_lib/auth.js';

// GET /api/me  ->  { user }   (used to validate a saved session)
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = requireUser(req, res);
  if (!user) return;
  return res.status(200).json({ user });
}