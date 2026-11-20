import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { UploadScreen } from './BusinessModule';
import useStoredFiles from '../hooks/useStoredFiles';
import DashBand, { Kpi, ICON } from '../components/DashBand';
import { initials } from '../api';
import { toDate } from './claimsData';
import { Z } from '../theme';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

/* ---------- clean-up helpers ---------- */
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const titleCase = (s) => clean(s).toLowerCase().replace(/(^|[\s(/&-])([a-z])/g, (m, p, c) => p + c.toUpperCase())
  .replace(/\b(Cfo|Ceo|Md|Hr|Gm|Cs|Vp|Coo|Cto|Dgm|Agm|F&a|Ltd|Pvt)\b/g, (w) => ({ Ltd: 'Ltd', Pvt: 'Pvt' }[w] || w.toUpperCase()));
const coKey = (s) => clean(s).toLowerCase().replace(/\b(pvt|private|ltd|limited|india|co|company|the)\b/g, '').replace(/[^a-z0-9]/g, '');
/* a date cell → Date, or keep the text note ("MEETING PENDING", "UPDATE" …) */
function cell(v) {
  if (v == null || v === '') return { date: null, note: '' };
  if (v instanceof Date || typeof v === 'number') return { date: toDate(v), note: '' };
  const s = clean(v);
  const d = /\d/.test(s) && !/pending|update|done/i.test(s) ? toDate(s.replace(/^(\d{1,2})-(\d{2})(\d{4})$/, '$1-$2-$3')) : null;
  return d ? { date: d, note: '' } : { date: null, note: s };
}
const fmt = (d) => (d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const daysSince = (d) => (d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 864e5)) : null);

function parseMeetsExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        let rows = [];
        for (let r = 0; r <= 2; r++) {
          const candidate = XLSX.utils.sheet_to_json(sheet, { defval: '', range: r });
          if (!candidate.length) continue;
          const keys = Object.keys(candidate[0]).map(k => k.toLowerCase());
          if (keys.some(k => k.includes('name') || k.includes('company') || k.includes('designation'))) { rows = candidate; break; }
        }
        if (!rows.length) rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!rows.length) return reject(new Error('No data found'));

        const keys = Object.keys(rows[0] || {});
        const find = (names, exclude) => {
          for (const n of names) {
            const hit = keys.find(k => k && k.toString().trim().toLowerCase() === n.toLowerCase());
            if (hit) return hit;
          }
          for (const n of names) {
            const hit = keys.find(k => k && k.toString().toLowerCase().includes(n.toLowerCase()) && (!exclude || !exclude.test(k)));
            if (hit) return hit;
          }
          return null;
        };
        const C = {
          name: find(['Name', 'Contact Name'], /company/i), designation: find(['Designation', 'Title']),
          company: find(['Company Name', 'Company']), location: find(['Location', 'City']),
          first: find(['First Interaction Date', 'First Interaction']), greet: find(['Last Greeting Sent', 'Last Greeting', 'Greeting']),
          met: find(['Interaction Date', 'Meeting Date'], /first/i),
        };

        let list = rows.map((r, i) => {
          const first = cell(r[C.first]); const greet = cell(r[C.greet]); const met = cell(r[C.met]);
          const notes = [first.note, greet.note, met.note].filter(Boolean);
          return {
            id: i,
            name: titleCase(r[C.name]),
            designation: titleCase(r[C.designation]),
            company: clean(r[C.company]),
            location: titleCase(r[C.location]).replace(/\s*-\s*/g, ' – '),
            firstDate: first.date, greetDate: greet.date, metDate: met.date,
            virtual: notes.some(n => /virtual\s*done/i.test(n)),
            note: notes.join(' · '),
          };
        }).filter(r => r.name && r.name.length > 1);

        // same company written two ways ("HETTICH" / "HETTICH INDIA PVT LTD") → one display name
        const groups = [];
        [...new Set(list.map(r => r.company).filter(Boolean))].sort((a, b) => b.length - a.length).forEach((co) => {
          const k = coKey(co);
          const g = groups.find(x => x.key.startsWith(k) || k.startsWith(x.key));
          if (g) g.names.push(co); else groups.push({ key: k, display: titleCase(co), names: [co] });
        });
        const coMap = {}; groups.forEach(g => g.names.forEach(n => { coMap[n] = g.display; }));
        list.forEach(r => { r.company = coMap[r.company] || titleCase(r.company) || '—'; });

        // the same person listed twice → keep one row with the most information
        const seen = new Map(); let dupes = 0;
        list.forEach((r) => {
          const k = `${r.name.toLowerCase().replace(/[^a-z]/g, '')}|${coKey(r.company)}`;
          const prev = seen.get(k);
          if (!prev) { seen.set(k, r); return; }
          dupes += 1;
          ['firstDate', 'greetDate', 'metDate', 'designation', 'location'].forEach(f => { if (!prev[f] && r[f]) prev[f] = r[f]; });
          prev.virtual = prev.virtual || r.virtual;
          prev.note = [prev.note, r.note].filter(Boolean).join(' · ');
        });
        list = [...seen.values()];
        const merged = groups.filter(g => g.names.length > 1).map(g => `${g.names.join(' / ')} → ${g.display}`);

        if (!list.length) return reject(new Error('No contact rows found'));
        resolve({ fileName: file.name, rows: list, dupes, merged });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read'));
    reader.readAsArrayBuffer(file);
  });
}

/* Stage of each contact in the relationship pipeline */
const STAGES = {
  met: { label: 'Met', bg: '#e2f7f3', fg: '#0f7c6f', c: Z.teal },
  virtual: { label: 'Virtual done', bg: '#e8f0ff', fg: '#1f4fb8', c: Z.azure },
  greeted: { label: 'Greeted · meeting pending', bg: '#fdf1df', fg: '#9a5d12', c: Z.amber },
  contacted: { label: 'Contacted · no follow-up', bg: '#fdebee', fg: '#a3283f', c: Z.rose },
  new: { label: 'Not contacted yet', bg: '#eef1f6', fg: '#4a5568', c: '#9aa8bf' },
};
const stageOf = (r) => (r.metDate ? 'met' : r.virtual ? 'virtual' : r.greetDate ? 'greeted' : r.firstDate ? 'contacted' : 'new');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export default function MeetsModule({ onBack }) {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState({ fileName: '', dupes: 0, merged: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [stage, setStage] = useState('all');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const replaceRef = useRef(null);

  // fromServer = true when the file comes from MongoDB (no re-upload)
  const handleFiles = async (fileList, fromServer = false) => {
    const files = Array.from(fileList || []).filter(f => /\.xlsx?$/i.test(f.name));
    if (!files.length) { setError('Upload .xlsx or .xls file'); return; }
    const file = files[files.length - 1];
    setLoading(true); setError('');
    try {
      const parsed = await parseMeetsExcel(file);
      setData(parsed.rows); setMeta({ fileName: parsed.fileName, dupes: parsed.dupes, merged: parsed.merged });
      setStage('all'); setCompanyFilter('all'); setSearch('');
      if (!fromServer) await store.save([file]);   // replaces the previous file on the server
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const store = useStoredFiles('meets', (files) => handleFiles(files, true));

  const companies = useMemo(() => [...new Set(data.map(r => r.company))].filter(c => c && c !== '—').sort(), [data]);
  const counts = useMemo(() => {
    const m = { met: 0, virtual: 0, greeted: 0, contacted: 0, new: 0 };
    data.forEach(r => { m[stageOf(r)] += 1; });
    return m;
  }, [data]);
  const met = counts.met;
  const engaged = counts.met + counts.virtual;
  const greeted = data.filter(r => r.greetDate).length;
  const contacted = data.filter(r => r.firstDate || r.greetDate || r.metDate || r.virtual).length;
  const pendingList = data.filter(r => !r.metDate);

  const companyStats = useMemo(() => {
    const m = {};
    data.forEach(r => {
      const s = (m[r.company] = m[r.company] || { total: 0, met: 0, greeted: 0 });
      s.total += 1; if (r.metDate || r.virtual) s.met += 1; if (r.greetDate) s.greeted += 1;
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  }, [data]);

  // activity by month: first interactions, greetings, meetings
  const activity = useMemo(() => {
    const keys = new Set();
    data.forEach(r => [r.firstDate, r.greetDate, r.metDate].forEach(d => d && keys.add(monthKey(d))));
    const months = [...keys].sort();
    const count = (f) => months.map(k => data.filter(r => r[f] && monthKey(r[f]) === k).length);
    return {
      labels: months.map(k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }); }),
      datasets: [
        { label: 'First interaction', data: count('firstDate'), backgroundColor: Z.ink700, borderRadius: 6 },
        { label: 'Greeting sent', data: count('greetDate'), backgroundColor: Z.gold, borderRadius: 6 },
        { label: 'Meeting held', data: count('metDate'), backgroundColor: Z.teal, borderRadius: 6 },
      ],
    };
  }, [data]);

  // follow-up queue: not met yet, longest since first contact first
  const followUps = useMemo(() => pendingList
    .map(r => ({ ...r, days: daysSince(r.greetDate || r.firstDate) }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1))
    .slice(0, 6), [pendingList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(r => {
      if (companyFilter !== 'all' && r.company !== companyFilter) return false;
      if (stage === 'pending' && r.metDate) return false;
      if (stage !== 'all' && stage !== 'pending' && stageOf(r) !== stage) return false;
      if (q) return `${r.name} ${r.company} ${r.designation} ${r.location} ${r.note}`.toLowerCase().includes(q);
      return true;
    });
  }, [data, search, companyFilter, stage]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtered.map((r, i) => ({
      '#': i + 1, Name: r.name, Designation: r.designation, Company: r.company, Location: r.location,
      'First Interaction': fmt(r.firstDate), 'Last Greeting Sent': fmt(r.greetDate), 'Meeting Date': fmt(r.metDate),
      Stage: STAGES[stageOf(r)].label, 'Days since last touch': r.metDate ? '' : daysSince(r.greetDate || r.firstDate) ?? '', Notes: r.note,
    }))), 'Contacts');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(companyStats.map(([c, s]) => ({ Company: c, Contacts: s.total, Greeted: s.greeted, Met: s.met, 'Met %': pct(s.met, s.total) }))), 'By Company');
    XLSX.writeFile(wb, 'Customer_Meets_Report.xlsx');
  };
  const downloadPDF = async () => {
    const el = document.getElementById('meets-content');
    if (!el) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(el, { scale: 1.4, backgroundColor: '#eef2f9' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const W = pdf.internal.pageSize.getWidth(); const H = pdf.internal.pageSize.getHeight();
      pdf.setFillColor(8, 20, 40); pdf.rect(0, 0, W, 20, 'F'); pdf.setFillColor(216, 178, 106); pdf.rect(0, 20, W, 1, 'F');
      pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.text('Zuari Insurance Brokers · Customer Meets', 10, 9);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(`${data.length} contacts · ${engaged} met · ${meta.fileName} · generated ${new Date().toLocaleDateString('en-GB')}`, 10, 15);
      const iw = W - 16; const pxPerMm = canvas.width / iw;
      let sy = 0; let first = true;
      while (sy < canvas.height) {
        const top = first ? 25 : 8;
        const sliceH = Math.min(canvas.height - sy, Math.floor((H - top - 8) * pxPerMm));
        const part = document.createElement('canvas'); part.width = canvas.width; part.height = sliceH;
        part.getContext('2d').drawImage(canvas, 0, sy, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (!first) pdf.addPage();
        pdf.addImage(part.toDataURL('image/jpeg', 0.9), 'JPEG', 8, top, iw, sliceH / pxPerMm);
        sy += sliceH; first = false;
      }
      pdf.save('Customer_Meets_Report.pdf');
    } catch (e) { alert('Could not create the PDF. Please try again.'); }
    finally { setBusy(false); }
  };

  if (!data.length) {
    return (
      <UploadScreen
        title="Customer Meets"
        desc="Upload Customer Meet Excel to track meetings, greetings and follow-ups."
        color="#d8b26a"
        loading={loading || store.booting || !!store.saving}
        loadingText={store.booting ? 'Loading uploaded data…' : store.saving || undefined}
        readOnly={!store.canUpload}
        error={error || store.storeError}
        dragOver={dragOver}
        setDragOver={setDragOver}
        onFiles={handleFiles}
        onBack={onBack}
        inputRef={inputRef}
        multiple={false}
        features={['Relationship pipeline', 'Company progress', 'Follow-up queue', 'PDF + Excel export']}
      />
    );
  }

  const jump = () => setTimeout(() => document.getElementById('mt-register')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  const funnel = [
    ['Contacts', data.length, Z.ink700],
    ['Contacted', contacted, Z.azure],
    ['Greeting sent', greeted, Z.gold],
    ['Met (incl. virtual)', engaged, Z.teal],
  ];
  const lastActivity = data.flatMap(r => [r.firstDate, r.greetDate, r.metDate]).filter(Boolean).sort((a, b) => b - a)[0];

  return (
    <div className="cl-page">
      <DashBand
        chip="CUSTOMER MEETS"
        title="Relationship tracker"
        subtitle={`${data.length} contacts · ${companies.length} companies${lastActivity ? ` · last activity ${fmt(lastActivity)}` : ''}`}
        onBack={onBack}
        store={store}
        actions={<>
          <button className="btn btn-ghost ds-btn" onClick={() => replaceRef.current?.click()}>⬆ Replace file</button>
          <input ref={replaceRef} type="file" accept=".xlsx,.xls" hidden onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        </>}
        exports={<>
          <button className="btn btn-gold" onClick={downloadPDF} disabled={busy}>{busy ? 'Preparing PDF…' : '⬇ Download PDF report'}</button>
          <button className="btn btn-ghost" onClick={exportExcel}>⬇ Excel ({filtered.length} rows)</button>
        </>}
      >
        {error && <div className="zi-err" style={{ maxWidth: 640 }}>⚠ {error}</div>}
      </DashBand>

      <div className="cl-main" id="meets-content">
        <div className="cl-kpis">
          <Kpi label="Contacts" value={data.length} hint={meta.dupes ? `${meta.dupes} duplicate merged` : 'decision makers tracked'} color={Z.ink700} icon={ICON.users} />
          <Kpi label="Companies" value={companies.length} hint={companyStats[0] ? `Most: ${companyStats[0][0]}` : ''} color={Z.azure} icon={ICON.building} />
          <Kpi label="Meetings held" value={met} hint={counts.virtual ? `+${counts.virtual} virtual` : 'in person'} color={Z.teal} icon={ICON.check} />
          <Kpi label="Meeting pending" value={pendingList.length} hint={`${counts.greeted} already greeted`} color={Z.rose} icon={ICON.clock} />
          <Kpi label="Greetings sent" value={greeted} hint={`${pct(greeted, data.length)}% of contacts`} color={Z.gold} icon={ICON.send} />
          <Kpi label="Meeting rate" value={`${pct(engaged, data.length)}%`} hint={`${engaged} of ${data.length} met`} color={Z.amber} icon={ICON.target} />
        </div>

        <div className="cl-grid ds-g3" style={{ marginTop: 18 }}>
          <div className="cl-card">
            <h3>Relationship pipeline</h3><div className="sub">From first contact to meeting</div>
            <div className="ds-funnel">
              {funnel.map(([l, n, c], i) => (
                <div key={l} className="step">
                  <div className="lbl"><span>{l}</span><b>{n}</b></div>
                  <div className="bar"><i style={{ width: `${Math.max(3, pct(n, data.length))}%`, background: c }} /></div>
                  {i > 0 && <small>{pct(n, funnel[i - 1][1])}% of previous step</small>}
                </div>
              ))}
            </div>
            <ul className="ds-legend" style={{ marginTop: 14 }}>
              {Object.entries(STAGES).map(([k, s]) => counts[k] > 0 && (
                <li key={k} className={stage === k ? 'on' : ''} onClick={() => { setStage(v => (v === k ? 'all' : k)); jump(); }}>
                  <i style={{ background: s.c }} /><span>{s.label}</span><b>{counts[k]}</b>
                </li>
              ))}
            </ul>
          </div>
          <div className="cl-card">
            <h3>Progress by company</h3><div className="sub">Contacts met out of tracked · click to filter</div>
            <ul className="ds-rank ds-progress">
              {companyStats.map(([co, s]) => (
                <li key={co} onClick={() => { setCompanyFilter(v => (v === co ? 'all' : co)); jump(); }} className={companyFilter === co ? 'on' : ''}>
                  <div className="t"><b>{co}</b><small>{s.total} contact{s.total > 1 ? 's' : ''} · {s.greeted} greeted</small></div>
                  <div className="bar two"><i className="g" style={{ width: `${pct(s.greeted, s.total)}%` }} /><i className="m" style={{ width: `${pct(s.met, s.total)}%` }} /></div>
                  <b className="v">{s.met}/{s.total}</b>
                </li>
              ))}
            </ul>
          </div>
          <div className="cl-card">
            <h3>Activity by month</h3><div className="sub">First interactions, greetings and meetings</div>
            <div className="cl-chart" style={{ height: 300 }}>
              <Bar data={activity} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 12 } }, tooltip: { padding: 10, cornerRadius: 10 } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef2f8' } }, x: { grid: { display: false } } },
              }} />
            </div>
          </div>
        </div>

        {followUps.length > 0 && (
          <div className="cl-card" style={{ marginTop: 18 }}>
            <div className="ds-reg-hd">
              <div><h3>Follow-up queue</h3><div className="sub">Not met yet · longest since last touch first</div></div>
              <button className="ds-clear" onClick={() => { setStage('pending'); jump(); }}>See all {pendingList.length} pending →</button>
            </div>
            <div className="ds-follow">
              {followUps.map(r => {
                const st = STAGES[stageOf(r)];
                return (
                  <div key={r.id} className="ds-fu" style={{ '--c': st.c }}>
                    <div className="hd"><span className="zi-avatar xs ds-av">{initials(r.name)}</span><div><b>{r.name}</b><small>{r.designation}</small></div></div>
                    <div className="co">{r.company}{r.location ? ` · ${r.location}` : ''}</div>
                    <div className="ft">
                      <span className="cl-badge" style={{ background: st.bg, color: st.fg }}><i />{st.label}</span>
                      {r.days != null && <span className={`days${r.days > 60 ? ' hot' : ''}`}>{r.days} days since {r.greetDate ? 'greeting' : 'first contact'}</span>}
                    </div>
                    {r.note && <div className="note">{r.note}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(meta.dupes > 0 || meta.merged.length > 0) && (
          <div className="ds-quality">
            <b>Data clean-up</b>
            {meta.dupes > 0 && <span>{meta.dupes} duplicate contact{meta.dupes > 1 ? 's' : ''} merged</span>}
            {meta.merged.map(m => <span key={m}>{m}</span>)}
          </div>
        )}

        <div id="mt-register" className="cl-card" style={{ marginTop: 18 }}>
          <div className="ds-reg-hd">
            <div><h3>Contacts</h3><div className="sub">{filtered.length} of {data.length} contacts</div></div>
            <div className="pp-seg" role="group" aria-label="Stage">
              {[['all', 'All'], ['met', 'Met'], ['pending', 'Pending'], ['greeted', 'Greeted'], ['contacted', 'No follow-up']].map(([v, l]) => (
                <button key={v} className={stage === v ? 'on' : ''} onClick={() => setStage(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="cl-filters">
            <input placeholder="Search name, company, designation, location…" value={search} onChange={e => setSearch(e.target.value)} />
            <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
              <option value="all">All companies</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(companyFilter !== 'all' || stage !== 'all' || search) && <button className="ds-clear" onClick={() => { setCompanyFilter('all'); setStage('all'); setSearch(''); }}>Clear ✕</button>}
          </div>
          <div className="cl-table-wrap">
            <table className="cl-table ds-table">
              <thead>
                <tr><th style={{ width: 44 }}>#</th><th>Contact</th><th>Company</th><th>Location</th><th>First interaction</th><th>Last greeting</th><th>Meeting</th><th>Stage</th></tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const st = STAGES[stageOf(r)];
                  return (
                    <tr key={r.id}>
                      <td className="muted">{i + 1}</td>
                      <td><div className="ds-who"><span className="zi-avatar xs ds-av">{initials(r.name)}</span><div><b>{r.name}</b><small>{r.designation}</small></div></div></td>
                      <td>{r.company}</td>
                      <td>{r.location || <span className="muted">—</span>}</td>
                      <td>{r.firstDate ? fmt(r.firstDate) : <span className="muted">—</span>}</td>
                      <td>{r.greetDate ? fmt(r.greetDate) : <span className="muted">—</span>}</td>
                      <td>{r.metDate ? <b className="ok">{fmt(r.metDate)}</b> : <span className="muted">—</span>}{r.note && <small className="note">{r.note}</small>}</td>
                      <td><span className="cl-badge" style={{ background: st.bg, color: st.fg }}><i />{st.label}</span></td>
                    </tr>
                  );
                })}
                {!filtered.length && <tr><td colSpan={8} className="cl-empty">No contacts match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}