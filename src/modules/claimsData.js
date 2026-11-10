import * as XLSX from 'xlsx';

/* =========================================================
   Claims Pending — parser + month-on-month history builder
   Works with both formats seen so far:
   - "Non_GHI_Clain_Pending.xlsx"           (header on row 1, "Status as on 31-08-26")
   - "Claims_Pending_till_30-09-26.xlsx"    (title row, header on row 2, + "Revised Amount Claimed")
   Every sheet that has an "Insured Name" header is read as one monthly snapshot.
========================================================= */

const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const key = (v) => norm(v).toLowerCase().replace(/[^a-z0-9]/g, '');

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

export function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    // SheetJS dates can land a few seconds before midnight; nudge to mid-day before reading parts
    const d = new Date(v.getTime() + 12 * 3600e3);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? new Date(d.y, d.m - 1, d.d) : null;
  }
  const s = String(v).trim();
  let m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    return new Date(y, +m[2] - 1, +m[1]);
  }
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,4})[a-z]*[\s,.-]+(\d{4})/i);
  if (m && MONTHS[m[2].toLowerCase()] != null) return new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

export const ymd = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
export const fmtDate = (d) => (d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtMonth = (d) => (d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Undated');

const num = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[,₹\s]/g, ''));
  return isFinite(n) ? n : 0;
};

export function partyOf(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('surveyor')) return 'Surveyor';
  if (s.includes('insurer')) return 'Insurer';
  if (s.includes('insured')) return 'Insured';
  if (s.includes('settled') || s.includes('closed') || s.includes('paid')) return 'Settled';
  return s ? 'Other' : 'Unspecified';
}

export function ageBandOf(age, months) {
  const a = String(age || '').toUpperCase().replace(/\s/g, '');
  if (a.includes('ABOVE') || a.startsWith('12')) return '12+';
  if (a.startsWith('9-12') || a.startsWith('9TO12')) return '9-12';
  if (a.startsWith('6-9')) return '6-9';
  if (a.startsWith('3-6')) return '3-6';
  if (a.startsWith('0-3')) return '0-3';
  if (months >= 12) return '12+';
  if (months >= 9) return '9-12';
  if (months >= 6) return '6-9';
  if (months >= 3) return '3-6';
  return '0-3';
}
export const AGE_BANDS = ['0-3', '3-6', '6-9', '9-12', '12+'];

export function policyLineOf(text) {
  const s = String(text || '').toLowerCase();
  if (/marine|stop|cargo|transit/.test(s)) return 'Marine';
  if (/\bear\b|erection|\bcar\b|contractor|engineering|machinery|\bcpm\b/.test(s)) return 'Engineering (EAR/CAR)';
  if (/sfsp|fire|floater|special peril/.test(s)) return 'Fire / SFSP';
  if (/d\s*&\s*o|directors|liability/.test(s)) return 'Liability / D&O';
  if (/mega|package|business protect|iar|all risk/.test(s)) return 'Package / Mega';
  if (/motor|vehicle/.test(s)) return 'Motor';
  return s ? 'Other' : 'Unspecified';
}

/* Find the header row (the one containing "Insured Name") in an array-of-arrays sheet */
function findHeaderRow(aoa) {
  for (let r = 0; r < Math.min(aoa.length, 12); r += 1) {
    const row = aoa[r] || [];
    if (row.some((c) => key(c) === 'insuredname' || key(c) === 'insured')) return r;
  }
  return -1;
}

function snapshotDateFrom(headers, aoa, headerIdx, rows, file) {
  // 1) "Status as on 30-09-26" header
  const statusHdr = headers.find((h) => /status\s*as\s*on/i.test(h));
  if (statusHdr) {
    const d = toDate(statusHdr.replace(/.*as\s*on/i, ''));
    if (d) return { date: d, source: statusHdr };
  }
  // 2) Title rows above the header ("Claim Pending as on 30th Sept,2026")
  for (let r = 0; r < headerIdx; r += 1) {
    const text = (aoa[r] || []).filter(Boolean).join(' ');
    if (/as\s*on/i.test(text)) {
      const d = toDate(text.replace(/.*as\s*on/i, ''));
      if (d) return { date: d, source: text };
    }
  }
  // 3) Most common "Date of Report"
  const counts = {};
  rows.forEach((r) => { if (r.reportDate) { const k = ymd(r.reportDate); counts[k] = (counts[k] || 0) + 1; } });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best) { const [y, m, d] = best[0].split('-').map(Number); return { date: new Date(y, m - 1, d), source: 'Date of Report' }; }
  // 4) File name like 30-09-26
  const fd = toDate(file.name);
  if (fd) return { date: fd, source: 'file name' };
  return { date: null, source: 'unknown' };
}

function parseSheet(sheet, sheetName, file) {
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
  const h = findHeaderRow(aoa);
  if (h < 0) return null;
  const headers = (aoa[h] || []).map((x) => norm(x));
  const col = (...names) => {
    for (const n of names) { const i = headers.findIndex((x) => key(x) === key(n)); if (i >= 0) return i; }
    for (const n of names) { const i = headers.findIndex((x) => key(x).includes(key(n))); if (i >= 0) return i; }
    return -1;
  };
  const C = {
    sno: col('S No', 'SNo', 'Sr No'),
    insured: col('Insured Name', 'Insured'),
    nature: col('Nature of Incidence', 'Nature of Incident', 'Nature'),
    insurer: col('Insurer'),
    policy: col('Type of Policy', 'Policy Type', 'Policy'),
    loss: col('Date of Loss', 'Loss Date', 'DOL'),
    initial: col('Initial Amount Claimed', 'Amount Claimed', 'Claim Amount'),
    revised: col('Revised Amount Claimed', 'Revised Amount'),
    settled: col('Amount Settled', 'Settled Amount', 'Settled'),
    ageing: col('Ageing'),
    report: col('Date of Report', 'Report Date'),
    months: col('Months'),
    age: col('Age'),
    status: headers.findIndex((x) => key(x) === 'status'),
    remark: headers.findIndex((x) => /status\s*as\s*on|remark|latest status|current status/i.test(x)),
  };
  if (C.status < 0) C.status = col('Status');
  if (C.remark < 0) C.remark = headers.length - 1; // last column holds the running remarks
  if (C.insured < 0) return null;
  const at = (row, i) => (i >= 0 ? row[i] : '');

  const rows = [];
  for (let r = h + 1; r < aoa.length; r += 1) {
    const row = aoa[r] || [];
    const insured = norm(at(row, C.insured));
    const sno = norm(at(row, C.sno));
    if (!insured || /^total$/i.test(insured) || /^total$/i.test(sno)) continue;
    const months = Math.round(num(at(row, C.months)));
    const status = norm(at(row, C.status));
    const initial = num(at(row, C.initial));
    const revised = num(at(row, C.revised));
    rows.push({
      sno,
      insured,
      nature: norm(at(row, C.nature)),
      insurer: norm(at(row, C.insurer)).replace(/\s{2,}/g, ' '),
      policy: norm(at(row, C.policy)),
      policyLine: policyLineOf(at(row, C.policy)),
      lossDate: toDate(at(row, C.loss)),
      initial,
      revised,
      current: revised || initial,
      settled: num(at(row, C.settled)),
      ageingLabel: norm(at(row, C.ageing)),
      reportDate: toDate(at(row, C.report)),
      months,
      ageBand: ageBandOf(at(row, C.age), months),
      status,
      party: partyOf(status),
      remark: norm(at(row, C.remark)),
    });
  }
  if (!rows.length) return null;
  const snap = snapshotDateFrom(headers, aoa, h, rows, file);
  return {
    id: `${file.name}::${sheetName}`,
    fileName: file.name,
    sheetName,
    date: snap.date,
    label: snap.date ? fmtMonth(snap.date) : `${file.name}${sheetName !== 'Sheet1' ? ` · ${sheetName}` : ''}`,
    remarkHeader: headers[C.remark] || 'Remarks',
    hasRevised: C.revised >= 0,
    rows,
  };
}

export function parseClaimsWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const snaps = wb.SheetNames.map((n) => parseSheet(wb.Sheets[n], n, file)).filter(Boolean);
        if (!snaps.length) return reject(new Error(`${file.name}: no sheet with an "Insured Name" header was found.`));
        resolve(snaps);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

/* Stable identity for a claim across monthly files */
function claimKey(r) {
  return [key(r.insured), ymd(r.lossDate), Math.round(r.initial), key(r.nature).slice(0, 48)].join('|');
}

/* Merge snapshots (oldest → newest) into per-claim histories */
export function buildHistory(snapshots) {
  const snaps = [...snapshots].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
  const claims = new Map();
  snaps.forEach((s, si) => {
    const seen = {};
    s.rows.forEach((r) => {
      let k = claimKey(r);
      seen[k] = (seen[k] || 0) + 1;
      if (seen[k] > 1) k = `${k}#${seen[k]}`;
      if (!claims.has(k)) claims.set(k, { key: k, entries: [] });
      claims.get(k).entries.push({ snapIndex: si, snapId: s.id, date: s.date, label: s.label, ...r });
    });
  });
  return { snaps, claims: [...claims.values()] };
}

/* Rows for one snapshot, enriched with history + change vs previous snapshot */
export function viewForSnapshot(history, snapIndex) {
  const { snaps, claims } = history;
  const prevIndex = snapIndex - 1;
  const rows = [];
  const closed = [];
  claims.forEach((c) => {
    const cur = c.entries.find((e) => e.snapIndex === snapIndex);
    const prev = prevIndex >= 0 ? c.entries.find((e) => e.snapIndex === prevIndex) : null;
    const trail = c.entries.filter((e) => e.snapIndex <= snapIndex);
    if (cur) {
      let change = 'BASE';
      if (prevIndex >= 0) {
        if (!prev) change = 'NEW';
        else if (key(prev.remark) !== key(cur.remark) || prev.party !== cur.party) change = 'UPDATED';
        else change = 'NO CHANGE';
      }
      // months since the remark last changed
      let staleSince = cur;
      for (let i = trail.length - 2; i >= 0; i -= 1) { if (key(trail[i].remark) === key(cur.remark)) staleSince = trail[i]; else break; }
      rows.push({ ...cur, key: c.key, prev, change, trail, unchangedSnaps: trail.length - trail.indexOf(staleSince) });
    } else if (prev) {
      closed.push({ ...prev, key: c.key, trail });
    }
  });
  return { snap: snaps[snapIndex], prevSnap: prevIndex >= 0 ? snaps[prevIndex] : null, rows, closed };
}

export function fmtINR(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e7) return `₹ ${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹ ${(v / 1e5).toFixed(2)} L`;
  return `₹ ${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
export const fmtFull = (n) => `₹ ${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
