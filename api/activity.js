import { getDb } from './_lib/db.js';
import { requireUser, sendError } from './_lib/auth.js';

// GET /api/activity?limit=20  ->  recent uploads / removals (logins excluded)
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const db = await getDb();
    const items = await db.collection('activity')
      .find({ action: { $in: ['upload', 'remove', 'clear'] } })
      .sort({ at: -1 })
      .limit(limit)
      .toArray();
    return res.status(200).json({
      activity: items.map((a) => ({
        action: a.action, module: a.module, name: a.name || null, user: a.user,
        replaced: a.replaced || [], count: a.count || null, at: a.at,
      })),
    });
  } catch (err) {
    return sendError(res, err);
  }
}