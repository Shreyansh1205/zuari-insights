import { MongoClient } from 'mongodb';

/*
  Shared MongoDB connection for all /api functions.
  The client is cached on globalThis so warm serverless invocations reuse it.
  Env: MONGODB_URI (required), MONGODB_DB (optional, default "zuari_insights")
*/

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'zuari_insights';

let cached = globalThis.__ziMongo;
if (!cached) cached = globalThis.__ziMongo = { client: null, promise: null, indexed: false };

export async function getDb() {
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!cached.client) {
    if (!cached.promise) {
      cached.promise = new MongoClient(uri, { maxPoolSize: 5 }).connect();
    }
    cached.client = await cached.promise;
  }
  const db = cached.client.db(dbName);
  if (!cached.indexed) {
    cached.indexed = true;
    await Promise.all([
      db.collection('files').createIndex({ module: 1, status: 1, uploadedAt: 1 }),
      db.collection('file_chunks').createIndex({ fileId: 1, n: 1 }, { unique: true }),
      db.collection('activity').createIndex({ at: -1 }),
    ]).catch(() => { cached.indexed = false; });
  }
  return db;
}

export const MODULES = {
  business: { title: 'Business Dashboard', mode: 'multi' },   // many FY files; same file name replaces
  customers: { title: 'Customer Master', mode: 'single' },    // latest file only
  claims: { title: 'Claims Pending', mode: 'multi' },         // monthly files; same file name replaces
  meets: { title: 'Customer Meets', mode: 'single' },         // latest file only
};

export const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB raw per chunk (~2.7 MB base64, under Vercel's 4.5 MB body limit)
export const MAX_FILE_SIZE = 40 * 1024 * 1024; // 40 MB per Excel file

export async function logActivity(db, entry) {
  try {
    await db.collection('activity').insertOne({ ...entry, at: new Date() });
  } catch { /* logging must never break the request */ }
}