import { ObjectId } from 'mongodb';
import { getDb, MODULES, logActivity } from '../_lib/db.js';
import { requireUser, sendError } from '../_lib/auth.js';

/*
  GET    /api/files/:id                         -> file details
  PATCH  /api/files/:id  { action: "finalize" } -> mark upload complete (uploader)
         single-file modules: older files are removed
         multi-file modules:  an older file with the same name is replaced
  DELETE /api/files/:id                         -> remove one file (uploader)
*/
export default async function handler(req, res) {
  try {
    let _id;
    try { _id = new ObjectId(String(req.query.id)); } catch { return res.status(400).json({ error: 'Bad file id' }); }

    const roles = req.method === 'GET' ? undefined : ['uploader'];
    const user = requireUser(req, res, roles);
    if (!user) return;

    const db = await getDb();
    const files = db.collection('files');
    const chunks = db.collection('file_chunks');
    const file = await files.findOne({ _id });
    if (!file || file.status === 'deleted') return res.status(404).json({ error: 'File not found' });

    if (req.method === 'GET') {
      return res.status(200).json({
        file: { id: String(file._id), module: file.module, name: file.name, size: file.size, chunkCount: file.chunkCount, status: file.status, uploadedBy: file.uploadedBy, uploadedAt: file.uploadedAt },
      });
    }

    if (req.method === 'PATCH') {
      if ((req.body || {}).action !== 'finalize') return res.status(400).json({ error: 'Unknown action' });
      if (file.status === 'active') return res.status(200).json({ ok: true });
      const have = await chunks.countDocuments({ fileId: _id });
      if (have !== file.chunkCount) return res.status(400).json({ error: `Upload incomplete (${have}/${file.chunkCount} parts)` });

      // what this upload replaces
      const mode = MODULES[file.module]?.mode || 'multi';
      const replaceFilter = mode === 'single'
        ? { module: file.module, status: 'active', _id: { $ne: _id } }
        : { module: file.module, status: 'active', name: file.name, _id: { $ne: _id } };
      const replaced = await files.find(replaceFilter).toArray();
      const replacedIds = replaced.map((f) => f._id);

      await files.updateOne({ _id }, { $set: { status: 'active', activatedAt: new Date() } });
      if (replacedIds.length) {
        await chunks.deleteMany({ fileId: { $in: replacedIds } });
        await files.updateMany({ _id: { $in: replacedIds } }, { $set: { status: 'deleted', deletedAt: new Date(), replacedBy: _id } });
      }
      await logActivity(db, {
        action: 'upload', module: file.module, name: file.name, size: file.size,
        user: user.name, role: user.role, replaced: replaced.map((f) => f.name),
      });
      return res.status(200).json({ ok: true, replaced: replaced.map((f) => f.name) });
    }

    if (req.method === 'DELETE') {
      await chunks.deleteMany({ fileId: _id });
      await files.updateOne({ _id }, { $set: { status: 'deleted', deletedAt: new Date(), deletedBy: user.name } });
      if (file.status === 'active') {
        await logActivity(db, { action: 'remove', module: file.module, name: file.name, user: user.name, role: user.role });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return sendError(res, err);
  }
}