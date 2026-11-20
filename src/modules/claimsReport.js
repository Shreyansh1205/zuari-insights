import * as XLSX from 'xlsx';

/* =========================================================
   Claims Pending — management report ("PPT" sheet + month sheets)

   Reads, from the same workbook as the claim-pending registers:
   - PPT            Ageing Claim MIS, Pending at Insurer / Surveyor / Insured,
                    Claim MIS (opening → closing), 12+ months vs 0-12 months
   - new claim      claims received this month
   - claim settled  claims settled this month
   - claim closed   claims repudiated / closed this month
   - Effect         claimed vs settled difference
   - new format     month-by-month movement (Opening … Closing) with YTD

   Tables are located by their labels, not fixed cell addresses, so moving a
   block up/down or adding a company row keeps working.
   All amounts are returned in rupees (the PPT sheet is in lacs).
========================================================= */

const LAC = 1e5;
const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const key = (v) => norm(v).toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[,₹\s]/g, '');
  if (!s || s === '-') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/* "Oct,26" / "Oct, 26" / "October 2026" / "Oct/26" → { y, m } */
export function monthFrom(text) {
  const m = String(text || '').match(/(?:^|[^a-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,._/-]*'?(\d{4}|\d{2})(?!\d)/i);
  if (!m) return null;
  let y = +m[2]; if (y < 100) y += 2000;
  return { y, m: MONTHS[m[1].toLowerCase()] };
}
export const monthKey = (mm) => (mm ? `${mm.y}-${String(mm.m + 1).padStart(2, '0')}` : '');
export const monthLabel = (mm) => (mm ? new Date(mm.y, mm.m, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '');

const aoaOf = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });

function findCell(aoa, test, from = { r: 0, c: 0 }) {
  for (let r = from.r; r < aoa.length; r += 1) {
    const row = aoa[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      if (r === from.r && c < from.c) continue;
      if (test(norm(row[c]), r, c)) return { r, c, text: norm(row[c]) };
    }
  }
  return null;
}
const isTotal = (s) => /^grand\s*total$|^total$/i.test(norm(s));

/* Company | Claims | Amount block that starts with a "Company Name" header under a title cell */
function companyBlock(aoa, title, amountMul) {
  if (!title) return null;
  const hdr = findCell(aoa, (t, r, c) => r > title.r && r <= title.r + 3 && c >= title.c && c <= title.c + 1 && /company/i.test(t));
  if (!hdr) return null;
  const rows = [];
  let total = null;
  for (let r = hdr.r + 1; r < aoa.length; r += 1) {
    const row = aoa[r] || [];
    const name = norm(row[hdr.c]);
    if (!name) { if (rows.length || total) break; continue; }
    const item = { name, claims: num(row[hdr.c + 1]), amount: num(row[hdr.c + 2]) * amountMul };
    if (isTotal(name)) { total = item; break; }
    rows.push(item);
  }
  if (!total) total = { name: 'Grand Total', claims: rows.reduce((a, x) => a + x.claims, 0), amount: rows.reduce((a, x) => a + x.amount, 0) };
  return { title: title.text, rows, total };
}

const BUCKETS = [
  ['settled', /settled/i],
  ['0-3', /^0\s*-\s*3/],
  ['3-6', /^3\s*-\s*6/],
  ['6-9', /^6\s*-\s*9/],
  ['9-12', /^9\s*-\s*12/],
  ['12+', /^12\s*(&|and|\+)?\s*(above|\+)?|12\s*\+/i],
];
export const PPT_BUCKETS = ['0-3', '3-6', '6-9', '9-12', '12+'];

function parseAgeing(aoa, mul) {
  const title = findCell(aoa, (t) => /ageing\s*claim\s*mis/i.test(t));
  const start = title ? { r: title.r, c: 0 } : { r: 0, c: 0 };
  const bucketRow = findCell(aoa, (t) => /^0\s*-\s*3/.test(t), start);
  if (!bucketRow) return null;
  const hr = aoa[bucketRow.r] || [];
  const cols = {};
  hr.forEach((cell, c) => {
    const t = norm(cell);
    if (!t) return;
    if (/total\s*no/i.test(t)) { cols.totalClaims = c; return; }
    if (/total\s*amount/i.test(t)) { cols.totalAmount = c; return; }
    const b = BUCKETS.find(([, re]) => re.test(t));
    if (b && cols[b[0]] == null) cols[b[0]] = c;
  });
  const sub = aoa[bucketRow.r + 1] || [];
  let nameCol = sub.findIndex((x) => /company/i.test(norm(x)));
  if (nameCol < 0) nameCol = Math.max(0, (cols.settled ?? cols['0-3']) - 1);
  const settledMonth = cols.settled != null ? monthFrom(norm(hr[cols.settled])) : null;

  const rows = [];
  let total = null;
  for (let r = bucketRow.r + 2; r < aoa.length; r += 1) {
    const row = aoa[r] || [];
    const name = norm(row[nameCol]);
    if (!name) { if (rows.length) break; continue; }
    const pair = (c) => (c == null ? { claims: 0, amount: 0 } : { claims: num(row[c]), amount: num(row[c + 1]) * mul });
    const item = { name, settled: pair(cols.settled), buckets: {} };
    PPT_BUCKETS.forEach((b) => { item.buckets[b] = pair(cols[b]); });
    item.claims = cols.totalClaims != null ? num(row[cols.totalClaims]) : PPT_BUCKETS.reduce((a, b) => a + item.buckets[b].claims, 0);
    item.amount = cols.totalAmount != null ? num(row[cols.totalAmount]) * mul : PPT_BUCKETS.reduce((a, b) => a + item.buckets[b].amount, 0);
    if (isTotal(name)) { total = item; break; }
    rows.push(item);
  }
  if (!rows.length) return null;
  if (!total) {
    total = { name: 'Grand Total', settled: { claims: 0, amount: 0 }, buckets: {}, claims: 0, amount: 0 };
    PPT_BUCKETS.forEach((b) => { total.buckets[b] = { claims: rows.reduce((a, x) => a + x.buckets[b].claims, 0), amount: rows.reduce((a, x) => a + x.buckets[b].amount, 0) }; });
    total.settled = { claims: rows.reduce((a, x) => a + x.settled.claims, 0), amount: rows.reduce((a, x) => a + x.settled.amount, 0) };
    total.claims = rows.reduce((a, x) => a + x.claims, 0);
    total.amount = rows.reduce((a, x) => a + x.amount, 0);
  }
  return { title: title?.text || 'Ageing Claim MIS', settledLabel: norm(hr[cols.settled]) || 'Claims settled', settledMonth, rows, total };
}

const MIS_FIELDS = [
  ['newCount', /no\.?\s*of\s*new/i], ['newAmount', /amount\s*of\s*new/i],
  ['settledCount', /no\.?\s*of\s*claims?\s*settled/i], ['settledAmount', /amount\s*settled/i],
  ['revision', /effect\s*of\s*revision/i],
  ['closedCount', /no\.?\s*of\s*claims?\s*(repudiated|closed)/i], ['closedAmount', /amount\s*of\s*claims?\s*(repudiated|closed)/i],
  ['pendingCount', /no\.?\s*of\s*pending/i], ['pendingAmount', /amount\s*pending/i],
];
function parseMIS(aoa, mul) {
  const title = findCell(aoa, (t) => /^claim\s*mis/i.test(t) && !/ageing/i.test(t));
  if (!title) return null;
  const hdrR = title.r + 1;
  const hr = aoa[hdrR] || [];
  const cols = {};
  hr.forEach((cell, c) => { const f = MIS_FIELDS.find(([k, re]) => cols[k] == null && re.test(norm(cell))); if (f) cols[f[0]] = c; });
  const rows = [];
  for (let r = hdrR + 1; r < Math.min(aoa.length, hdrR + 8); r += 1) {
    const row = aoa[r] || [];
    const label = norm(row[title.c]);
    if (!label) { if (rows.length) break; continue; }
    const o = { label };
    MIS_FIELDS.forEach(([k]) => { o[k] = cols[k] == null ? 0 : num(row[cols[k]]) * (/count/i.test(k) ? 1 : mul); });
    rows.push(o);
  }
  if (!rows.length) return null;
  return { title: title.text, month: monthFrom(title.text), opening: rows.length > 1 ? rows[0] : null, current: rows[rows.length - 1], rows };
}

function parsePPT(ws) {
  const aoa = aoaOf(ws);
  const allText = aoa.map((r) => r.join(' ')).join(' ');
  const mul = /in\s*lacs?|in\s*lakhs?/i.test(allText) ? LAC : 1;
  const ageing = parseAgeing(aoa, mul);
  const mis = parseMIS(aoa, mul);
  const at = (re) => companyBlock(aoa, findCell(aoa, (t) => re.test(t)), mul);
  const pendingAt = {
    Insurer: at(/pending\s*at\s*insurer/i),
    Surveyor: at(/pending\s*at\s*surveyor/i),
    Insured: at(/pending\s*at\s*insured/i),
  };
  const above12 = at(/^12\s*months?\s*(&|and)\s*above/i);
  const below12 = at(/^0\s*-\s*12\s*months?/i);
  if (!ageing && !mis && !pendingAt.Insurer && !pendingAt.Surveyor && !pendingAt.Insured) return null;
  return { ageing, mis, pendingAt, above12, below12, unit: mul === LAC ? 'lacs' : 'rupees' };
}

/* new claim / claim settled / claim closed — simple claim lists */
function parseList(ws) {
  const aoa = aoaOf(ws);
  const hdr = findCell(aoa, (t) => /^insured(\s*name)?$/i.test(t));
  if (!hdr) return null;
  const headers = (aoa[hdr.r] || []).map(norm);
  const col = (re) => headers.findIndex((h) => re.test(h));
  const C = {
    insured: hdr.c, nature: col(/nature/i), insurer: col(/^insurer/i), policy: col(/type\s*of\s*policy|policy/i),
    loss: col(/date\s*of\s*loss/i), claimed: col(/amount\s*claimed/i), settled: col(/amount\s*settled/i), status: col(/^status/i),
  };
  const title = norm((aoa.slice(0, hdr.r).find((r) => r.some((c) => norm(c))) || []).find((c) => norm(c)));
  const items = [];
  let totals = null;
  for (let r = hdr.r + 1; r < aoa.length; r += 1) {
    const row = aoa[r] || [];
    const first = norm(row[0]) || norm(row[C.insured]);
    if (isTotal(first)) { totals = { claimed: num(row[C.claimed]), settled: num(row[C.settled]) }; break; }
    const insured = norm(row[C.insured]);
    const nature = norm(row[C.nature]);
    if (!insured && (!nature || /^nil$/i.test(nature))) continue;
    if (!insured) continue;
    const loss = row[C.loss];
    items.push({
      insured, nature, insurer: norm(row[C.insurer]), policy: norm(row[C.policy]),
      lossDate: loss instanceof Date ? loss : (norm(loss) || ''),
      claimed: num(row[C.claimed]), settled: num(row[C.settled]), status: norm(row[C.status]),
    });
  }
  if (!totals) totals = { claimed: items.reduce((a, x) => a + x.claimed, 0), settled: items.reduce((a, x) => a + x.settled, 0) };
  return { title, month: monthFrom(title), items, totals };
}

function parseEffect(ws) {
  const aoa = aoaOf(ws);
  const hdr = findCell(aoa, (t) => /^insured/i.test(t));
  if (!hdr) return null;
  const headers = (aoa[hdr.r] || []).map(norm);
  const cc = headers.findIndex((h) => /claimed/i.test(h));
  const cs = headers.findIndex((h) => /settled/i.test(h));
  const cd = headers.findIndex((h) => /difference|diff/i.test(h));
  const rows = [];
  let total = null;
  for (let r = hdr.r + 1; r < aoa.length; r += 1) {
    const row = aoa[r] || [];
    const name = norm(row[hdr.c]);
    if (!name) continue;
    const item = { name, claimed: num(row[cc]), settled: num(row[cs]), diff: cd >= 0 ? num(row[cd]) : num(row[cc]) - num(row[cs]) };
    if (isTotal(name)) { total = item; break; }
    rows.push(item);
  }
  if (!rows.length) return null;
  return { rows, total: total || { name: 'Total', claimed: rows.reduce((a, x) => a + x.claimed, 0), settled: rows.reduce((a, x) => a + x.settled, 0), diff: rows.reduce((a, x) => a + x.diff, 0) } };
}

const TREND_FIELDS = [
  ['opening', /^opening/i], ['revision', /revision/i], ['received', /received|new/i],
  ['settled', /settled/i], ['withdrawn', /withdrawn|repudiated|closed/i], ['closing', /^closing/i],
];
/* "new format": repeated blocks  [Non GHI Claims | Mon | YTD | Mon | YTD]  (counts, then amounts) */
function parseTrend(ws) {
  const aoa = aoaOf(ws);
  const blocks = [];
  aoa.forEach((row, r) => (row || []).forEach((cell, c) => {
    if (!/non\s*ghi\s*claims|^claims$/i.test(norm(cell))) return;
    const label = row[c + 1];
    const mm = label instanceof Date ? { y: label.getFullYear(), m: label.getMonth() } : monthFrom(norm(label));
    if (!mm) return;
    const b = { month: mm, label: monthLabel(mm) };
    for (let rr = r + 1; rr < Math.min(aoa.length, r + 10); rr += 1) {
      const rw = aoa[rr] || [];
      const f = TREND_FIELDS.find(([k, re]) => b[k] == null && re.test(norm(rw[c])));
      if (!f) continue;
      b[f[0]] = { count: num(rw[c + 1]), ytdCount: num(rw[c + 2]), amount: num(rw[c + 3]), ytdAmount: num(rw[c + 4]) };
    }
    if (b.opening || b.closing) blocks.push(b);
  }));
  if (!blocks.length) return null;
  const maxAmt = Math.max(...blocks.flatMap((b) => TREND_FIELDS.map(([k]) => b[k]?.amount || 0)));
  const mul = maxAmt < 1e5 ? LAC : 1; // the sheet is in lacs like the PPT
  blocks.forEach((b) => TREND_FIELDS.forEach(([k]) => { if (b[k]) { b[k].amount *= mul; b[k].ytdAmount *= mul; } else b[k] = { count: 0, ytdCount: 0, amount: 0, ytdAmount: 0 }; }));
  blocks.sort((a, b) => a.month.y - b.month.y || a.month.m - b.month.m);
  return blocks;
}

/* Which sheets are movement / report sheets (never treated as a monthly register) */
export const REPORT_SHEET = /ppt|new\s*claim|sett?l+ed|closed|repudiat|effect|new\s*format|summary|mis/i;

export function parseReportWorkbook(wb, file) {
  const find = (re) => wb.SheetNames.find((n) => re.test(n));
  const pptName = find(/ppt/i);
  const ppt = pptName ? parsePPT(wb.Sheets[pptName]) : null;
  const lists = {
    received: find(/new\s*claim/i) ? parseList(wb.Sheets[find(/new\s*claim/i)]) : null,
    settled: find(/sett?l+ed/i) ? parseList(wb.Sheets[find(/sett?l+ed/i)]) : null,
    closed: find(/closed|repudiat/i) ? parseList(wb.Sheets[find(/closed|repudiat/i)]) : null,
  };
  const effect = find(/effect/i) ? parseEffect(wb.Sheets[find(/effect/i)]) : null;
  const trend = find(/new\s*format|trend/i) ? parseTrend(wb.Sheets[find(/new\s*format|trend/i)]) : null;
  if (!ppt && !lists.received && !lists.settled && !trend) return null;

  const month = ppt?.mis?.month || ppt?.ageing?.settledMonth || lists.received?.month || lists.settled?.month
    || (trend && trend[trend.length - 1].month) || monthFrom(file?.name);
  return {
    id: file?.name || 'report',
    fileName: file?.name || '',
    month,
    key: monthKey(month),
    label: monthLabel(month),
    ppt, lists, effect, trend,
  };
}