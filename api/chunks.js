import { ObjectId, Binary } from 'mongodb';
import { getDb, CHUNK_SIZE } from './_lib/db.js';
import { requireUser, sendError } from './_lib/auth.js';

/*
  Files travel in 2 MB parts so every request stays under Vercel's 4.5 MB limit.
  PUT /api/chunks?file=<id>   { n, data: base64 }  -> store part n         (uploader)
  GET /api/chunks?file=<id>&n=0                    -> { n, data: base64 } (uploader + admin)
*/
export default async function handler(req, res) {
  try {
    let fileId;
    try { fileId = new ObjectId(String(req.query.file)); } catch { return res.status(400).json({ error: 'Bad file id' }); }

    const db = await getDb();
    const files = db.collection('files');
    const chunks = db.collection('file_chunks');

    if (req.method === 'PUT') {
      const user = requireUser(req, res, ['uploader']);
      if (!user) return;
      const file = await files.findOne({ _id: fileId });
      if (!file || file.status !== 'uploading') return res.status(404).json({ error: 'Upload not found or already finished' });
      const n = Number((req.body || {}).n);
      const data = (req.body || {}).data;
      if (!Number.isInteger(n) || n < 0 || n >= file.chunkCount) return res.status(400).json({ error: 'Bad part number' });
      if (typeof data !== 'string' || !data) return res.status(400).json({ error: 'Missing data' });
      const buf = Buffer.from(data, 'base64');
      if (buf.length > CHUNK_SIZE) return res.status(400).json({ error: 'Part too large' });
      await chunks.updateOne(
        { fileId, n },
        { $set: { fileId, n, data: new Binary(buf), size: buf.length } },
        { upsert: true },
      );
      return res.status(200).json({ ok: true, n });
    }

    if (req.method === 'GET') {
      const user = requireUser(req, res);
      if (!user) return;
      const file = await files.findOne({ _id: fileId, status: 'active' });
      if (!file) return res.status(404).json({ error: 'File not found' });
      const n = Number(req.query.n);
      const chunk = await chunks.findOne({ fileId, n });
      if (!chunk) return res.status(404).json({ error: 'Part not found' });
      const buf = Buffer.from(chunk.data.buffer);
      res.setHeader('Cache-Control', 'private, max-age=0, no-store');
      return res.status(200).json({ n, data: buf.toString('base64') });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return sendError(res, err);
  }
}