/*
  Browser client for the /api serverless functions (same origin on Vercel).
  Files are sent and fetched in 2 MB parts to stay under Vercel's request limit.
*/

const SESSION_KEY = 'zi_session';
const CHUNK = 2 * 1024 * 1024;

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
export function saveSession(s) {
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(path, { method = 'GET', body } = {}) {
  const session = getSession();
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && path !== '/api/login') onUnauthorized();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------- auth ---------- */
export const login = (username, password) => request('/api/login', { method: 'POST', body: { username, password } });
export const me = () => request('/api/me');

/* ---------- files ---------- */
export const listFiles = (module) => request(`/api/files?module=${encodeURIComponent(module)}`).then((d) => d.files || []);
export const getSummary = () => request('/api/files?summary=1').then((d) => d.summary || {});
export const getActivity = (limit = 12) => request(`/api/activity?limit=${limit}`).then((d) => d.activity || []);
export const deleteFile = (id) => request(`/api/files/${id}`, { method: 'DELETE' });
export const clearModule = (module) => request(`/api/files?module=${encodeURIComponent(module)}`, { method: 'DELETE' });

function toBase64(bytes) {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/* Upload one File; onProgress(0..1) */
export async function uploadFile(module, file, onProgress = () => {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkCount = Math.max(1, Math.ceil(bytes.length / CHUNK));
  const { id } = await request('/api/files', {
    method: 'POST',
    body: { module, name: file.name, size: bytes.length, type: file.type, chunkCount },
  });
  try {
    for (let n = 0; n < chunkCount; n += 1) {
      const part = bytes.subarray(n * CHUNK, Math.min((n + 1) * CHUNK, bytes.length));
      await request(`/api/chunks?file=${id}`, { method: 'PUT', body: { n, data: toBase64(part) } });
      onProgress((n + 1) / chunkCount);
    }
    return await request(`/api/files/${id}`, { method: 'PATCH', body: { action: 'finalize' } });
  } catch (err) {
    request(`/api/files/${id}`, { method: 'DELETE' }).catch(() => {});
    throw err;
  }
}

/* Download a stored file back into a browser File object */
export async function downloadFile(meta) {
  const parts = [];
  for (let n = 0; n < meta.chunkCount; n += 1) {
    const { data } = await request(`/api/chunks?file=${meta.id}&n=${n}`);
    parts.push(fromBase64(data));
  }
  return new File(parts, meta.name, {
    type: meta.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    lastModified: new Date(meta.uploadedAt).getTime() || Date.now(),
  });
}

export const MODULE_TITLES = {
  business: 'Business Dashboard',
  customers: 'Customer Master',
  claims: 'Claims Pending',
  meets: 'Customer Meets',
};

export function timeAgo(d) {
  if (!d) return '';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const days = Math.floor(h / 24); if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return fmtWhen(d);
}

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

export function fmtWhen(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}