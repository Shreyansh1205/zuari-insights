import { getDb, MODULES, CHUNK_SIZE, MAX_FILE_SIZE, logActivity } from '../_lib/db.js';
import { requireUser, sendError } from '../_lib/auth.js';

const publicFile = (f) => ({
  id: String(f._id),
  module: f.module,
  name: f.name,
  size: f.size,
  type: f.type,
  chunkCount: f.chunkCount,
  uploadedBy: f.uploadedBy,
  uploadedAt: f.uploadedAt,
});

/*
  GET    /api/files?module=claims      -> active files of a module (oldest first)
  GET    /api/files?summary=1          -> per-module count + last upload
  POST   /api/files                    -> start an upload   (uploader)
         { module, name, size, type, chunkCount }
  DELETE /api/files?module=claims      -> remove every file of a module (uploader)
*/
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const user = requireUser(req, res);
      if (!user) return;
      const db = await getDb();
      const files = db.collection('files');

      if (req.query.summary) {
        const out = {};
        for (const key of Object.keys(MODULES)) {
          const active = await files.find({ module: key, status: 'active' }).sort({ uploadedAt: -1 }).toArray();
          out[key] = {
            count: active.length,
            lastUploadedAt: active[0]?.uploadedAt || null,
            lastUploadedBy: active[0]?.uploadedBy || null,
            files: active.map((f) => f.name),
          };
        }
        return res.status(200).json({ summary: out });
      }

      const module = String(req.query.module || '');
      if (!MODULES[module]) return res.status(400).json({ error: 'Unknown module' });
      const list = await files.find({ module, status: 'active' }).sort({ uploadedAt: 1 }).toArray();
      return res.status(200).json({ files: list.map(publicFile) });
    }

    if (req.method === 'POST') {
      const user = requireUser(req, res, ['uploader']);
      if (!user) return;
      const { module, name, size, type, chunkCount } = req.body || {};
      if (!MODULES[module]) return res.status(400).json({ error: 'Unknown module' });
      if (!name || !/\.xlsx?$/i.test(name)) return res.status(400).json({ error: 'Only .xlsx / .xls files are allowed' });
      const bytes = Number(size) || 0;
      if (bytes <= 0 || bytes > MAX_FILE_SIZE) return res.status(400).json({ error: 'File is empty or larger than 40 MB' });
      const expected = Math.ceil(bytes / CHUNK_SIZE);
      if (Number(chunkCount) !== expected) return res.status(400).json({ error: `chunkCount must be ${expected}` });

      const db = await getDb();
      const doc = {
        module,
        name: String(name).slice(0, 200),
        size: bytes,
        type: type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        chunkCount: expected,
        status: 'uploading',
        uploadedBy: user.name,
        uploadedByUser: user.username,
        uploadedAt: new Date(),
      };
      const { insertedId } = await db.collection('files').insertOne(doc);
      return res.status(201).json({ id: String(insertedId), chunkSize: CHUNK_SIZE });
    }

    if (req.method === 'DELETE') {
      const user = requireUser(req, res, ['uploader']);
      if (!user) return;
      const module = String(req.query.module || '');
      if (!MODULES[module]) return res.status(400).json({ error: 'Unknown module' });
      const db = await getDb();
      const list = await db.collection('files').find({ module, status: { $ne: 'deleted' } }).toArray();
      const ids = list.map((f) => f._id);
      if (ids.length) {
        await db.collection('file_chunks').deleteMany({ fileId: { $in: ids } });
        await db.collection('files').updateMany({ _id: { $in: ids } }, { $set: { status: 'deleted', deletedAt: new Date(), deletedBy: user.name } });
      }
      await logActivity(db, { action: 'clear', module, user: user.name, role: user.role, count: ids.length });
      return res.status(200).json({ removed: ids.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return sendError(res, err);
  }
}