import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { UploadScreen } from './BusinessModule';
import {
  parseClaimsWorkbook, buildHistory, viewForSnapshot, fmtINR, fmtFull, fmtDate, AGE_BANDS,
} from './claimsData';
import { Z, CHART_COLORS } from '../theme';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, Tooltip, Legend, Filler);
ChartJS.defaults.font.family = 'Manrope, Inter, system-ui, sans-serif';
ChartJS.defaults.color = '#5f6f88';

const DataScene = lazy(() => import('../three/DataScene.jsx'));

const PARTY_STYLE = {
  Insured: { bg: Z.amberSoft, fg: '#9a5d12', c: Z.amber },
  Surveyor: { bg: Z.azureSoft, fg: '#1f4fb8', c: Z.azure },
  Insurer: { bg: Z.roseSoft, fg: '#a3283f', c: Z.rose },
  Settled: { bg: Z.tealSoft, fg: '#0f7c6f', c: Z.teal },
  Other: { bg: '#eef1f6', fg: '#4a5568', c: '#9aa8bf' },
  Unspecified: { bg: '#eef1f6', fg: '#4a5568', c: '#9aa8bf' },
};
const AGE_STYLE = { '0-3': ['#e2f7f3', '#0f7c6f'], '3-6': ['#e8f0ff', '#1f4fb8'], '6-9': ['#fdf1df', '#9a5d12'], '9-12': ['#fde6d6', '#a2501a'], '12+': ['#fdebee', '#a3283f'] };
const CHANGE_STYLE = { NEW: ['#e2f7f3', '#0f7c6f'], UPDATED: ['#e8f0ff', '#1f4fb8'], 'NO CHANGE': ['#f1f3f7', '#6b7a92'] };

const short = (s, n = 90) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '—');
const sum = (rows, f) => rows.reduce((a, r) => a + (Number(r[f]) || 0), 0);
const by = (rows, f, val = () => 1) => {
  const m = {};
  rows.forEach((r) => { const k = r[f] || 'Unspecified'; m[k] = (m[k] || 0) + val(r); });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};

function PartyBadge({ party }) {
  const s = PARTY_STYLE[party] || PARTY_STYLE.Other;
  return <span className="cl-badge" style={{ background: s.bg, color: s.fg }}><i />{party === 'Settled' ? 'Settled' : `With ${party}`}</span>;
}
function AgeTag({ band }) {
  const [bg, fg] = AGE_STYLE[band] || ['#eef1f6', '#4a5568'];
  return <span className="cl-age" style={{ background: bg, color: fg }}>{band} mo</span>;
}
function ChangeTag({ change }) {
  if (!change || change === 'BASE') return null;
  const [bg, fg] = CHANGE_STYLE[change] || CHANGE_STYLE['NO CHANGE'];
  return <span className="cl-chg" style={{ background: bg, color: fg }}>{change}</span>;
}

const chartOpts = (extra = {}) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } }, tooltip: { padding: 10, cornerRadius: 10 } },
  ...extra,
});
const moneyAxis = { ticks: { callback: (v) => fmtINR(v).replace('₹ ', '₹') }, grid: { color: '#eef2f8' } };

export default function ClaimsModule({ onBack }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [snapIndex, setSnapIndex] = useState(-1);
  const [tab, setTab] = useState('overview');
  const [f, setF] = useState({ party: 'all', age: 'all', insured: 'all', insurer: 'all', change: 'all', q: '' });
  const [sort, setSort] = useState({ k: 'current', dir: -1 });
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState('');
  const inputRef = useRef(null);
  const addRef = useRef(null);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((x) => /\.xlsx?$/i.test(x.name));
    if (!files.length) { setError('Please upload .xlsx or .xls files.'); return; }
    setLoading(true); setError('');
    const errs = [];
    const added = [];
    for (const file of files) {
      try { added.push(...(await parseClaimsWorkbook(file))); } catch (e) { errs.push(e.message); }
    }
    if (added.length) {
      setSnapshots((prev) => {
        const map = new Map(prev.map((s) => [s.date ? s.date.getTime() : s.id, s]));
        added.forEach((s) => map.set(s.date ? s.date.getTime() : s.id, s)); // same month uploaded again → replace
        return [...map.values()];
      });
      setSnapIndex(-1);
      window.scrollTo({ top: 0 });
    }
    if (errs.length) setError(errs.join(' · '));
    setLoading(false);
  };

  const history = useMemo(() => (snapshots.length ? buildHistory(snapshots) : null), [snapshots]);
  const idx = history ? (snapIndex < 0 || snapIndex >= history.snaps.length ? history.snaps.length - 1 : snapIndex) : -1;
  const view = useMemo(() => (history ? viewForSnapshot(history, idx) : null), [history, idx]);

  useEffect(() => { if (!open) return undefined; const k = (e) => e.key === 'Escape' && setOpen(null); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);

  if (!history) {
    return (
      <UploadScreen
        title="Claims Pending"
        desc="Upload the monthly Claims Pending sheet. Add several months (e.g. 31-Aug and 30-Sep) to see how each claim's remarks moved."
        loading={loading}
        error={error}
        dragOver={dragOver}
        setDragOver={setDragOver}
        onFiles={handleFiles}
        onBack={onBack}
        inputRef={inputRef}
        hint="Select one or more monthly files at once"
        features={['Multi-month history', 'Remarks timeline', 'Ageing & pending-with', 'What changed this month', 'PDF + Excel report']}
      />
    );
  }

  const { rows, closed, snap, prevSnap } = view;
  const multi = history.snaps.length > 1;

  // ---------- KPIs ----------
  const tInitial = sum(rows, 'initial');
  const tCurrent = sum(rows, 'current');
  const tSettled = sum(rows, 'settled');
  const old = rows.filter((r) => r.ageBand === '12+');
  const avgMonths = rows.length ? rows.reduce((a, r) => a + r.months, 0) / rows.length : 0;
  const updated = rows.filter((r) => r.change === 'UPDATED');
  const fresh = rows.filter((r) => r.change === 'NEW');
  const stale = rows.filter((r) => r.change === 'NO CHANGE');

  // ---------- Filters ----------
  const insureds = [...new Set(rows.map((r) => r.insured))].sort();
  const insurers = [...new Set(rows.map((r) => r.insurer))].filter(Boolean).sort();
  const parties = [...new Set(rows.map((r) => r.party))];
  const filtered = rows
    .filter((r) => (f.party === 'all' || r.party === f.party)
      && (f.age === 'all' || r.ageBand === f.age)
      && (f.insured === 'all' || r.insured === f.insured)
      && (f.insurer === 'all' || r.insurer === f.insurer)
      && (f.change === 'all' || r.change === f.change)
      && (!f.q || `${r.insured} ${r.nature} ${r.insurer} ${r.policy} ${r.remark}`.toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => {
      const x = a[sort.k]; const y = b[sort.k];
      if (x instanceof Date || y instanceof Date) return ((x?.getTime() || 0) - (y?.getTime() || 0)) * sort.dir;
      if (typeof x === 'number' || typeof y === 'number') return ((x || 0) - (y || 0)) * sort.dir;
      return String(x || '').localeCompare(String(y || '')) * sort.dir;
    });
  const setSortKey = (k) => setSort((s) => ({ k, dir: s.k === k ? -s.dir : -1 }));
  const drill = (patch) => { setF((p) => ({ ...p, ...patch })); setTab('register'); };

  // ---------- Charts ----------
  const partyAgg = by(rows, 'party');
  const partyChart = {
    labels: partyAgg.map(([k]) => k),
    datasets: [{ data: partyAgg.map(([, v]) => v), backgroundColor: partyAgg.map(([k]) => (PARTY_STYLE[k] || PARTY_STYLE.Other).c), borderWidth: 0, hoverOffset: 8 }],
  };
  const ageChart = {
    labels: AGE_BANDS.map((b) => `${b} mo`),
    datasets: [
      { label: 'Claims', data: AGE_BANDS.map((b) => rows.filter((r) => r.ageBand === b).length), backgroundColor: Z.azure, borderRadius: 8, yAxisID: 'y' },
      { label: 'Amount claimed', data: AGE_BANDS.map((b) => sum(rows.filter((r) => r.ageBand === b), 'current')), backgroundColor: Z.gold, borderRadius: 8, yAxisID: 'y1' },
    ],
  };
  const insuredAgg = by(rows, 'insured', (r) => r.current).slice(0, 8);
  const insuredChart = {
    labels: insuredAgg.map(([k]) => short(k, 28)),
    datasets: [{ label: 'Amount claimed', data: insuredAgg.map(([, v]) => v), backgroundColor: insuredAgg.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]), borderRadius: 8 }],
  };
  const lineAgg = by(rows, 'policyLine');
  const lineChart = { labels: lineAgg.map(([k]) => k), datasets: [{ data: lineAgg.map(([, v]) => v), backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 8 }] };
  const insurerAgg = by(rows, 'insurer', (r) => r.current).slice(0, 8);
  const insurerChart = {
    labels: insurerAgg.map(([k]) => short(k, 26)),
    datasets: [{ label: 'Amount claimed', data: insurerAgg.map(([, v]) => v), backgroundColor: Z.teal, borderRadius: 8 }],
  };
  const trend = history.snaps.map((s, i) => viewForSnapshot(history, i));
  const trendChart = {
    labels: history.snaps.map((s) => s.label),
    datasets: [
      { label: 'Pending claims', data: trend.map((v) => v.rows.length), borderColor: Z.azure, backgroundColor: 'rgba(47,123,255,.12)', fill: true, tension: 0.35, yAxisID: 'y', pointRadius: 5 },
      { label: 'Amount claimed', data: trend.map((v) => sum(v.rows, 'current')), borderColor: Z.gold, backgroundColor: 'transparent', tension: 0.35, yAxisID: 'y1', pointRadius: 5 },
    ],
  };

  // ---------- Exports ----------
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const snapCols = history.snaps.slice(0, idx + 1);
    const reg = filtered.map((r, i) => {
      const o = {
        '#': i + 1, 'Insured Name': r.insured, 'Nature of Incidence': r.nature, Insurer: r.insurer, 'Type of Policy': r.policy,
        'Policy Line': r.policyLine, 'Date of Loss': r.lossDate ? fmtDate(r.lossDate) : '', 'Initial Amount Claimed': r.initial,
        'Revised Amount Claimed': r.revised || '', 'Amount Settled': r.settled || '', Months: r.months, Age: r.ageBand,
        'Pending With': r.party, Status: r.status, 'Change vs Previous': r.change === 'BASE' ? '' : r.change,
      };
      snapCols.forEach((s) => { o[`Remark as on ${s.label}`] = r.trail.find((t) => t.snapId === s.id)?.remark || ''; });
      return o;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reg), 'Claims & Remarks');
    const summary = [
      { Metric: 'Snapshot', Value: snap.label },
      { Metric: 'Pending claims', Value: rows.length },
      { Metric: 'Initial amount claimed', Value: tInitial },
      { Metric: 'Current amount claimed (revised where available)', Value: tCurrent },
      { Metric: 'Amount settled so far', Value: tSettled },
      { Metric: 'Claims 12+ months', Value: old.length },
      ...(prevSnap ? [
        { Metric: `New since ${prevSnap.label}`, Value: fresh.length },
        { Metric: 'Remarks updated', Value: updated.length },
        { Metric: 'No change in remarks', Value: stale.length },
        { Metric: `Dropped off since ${prevSnap.label} (closed / settled)`, Value: closed.length },
      ] : []),
      ...partyAgg.map(([k, v]) => ({ Metric: `Pending with ${k}`, Value: v })),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');
    if (closed.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(closed.map((r) => ({
        'Insured Name': r.insured, 'Nature of Incidence': r.nature, Insurer: r.insurer, 'Initial Amount Claimed': r.initial, 'Last Remark': r.remark, 'Last Seen': r.label,
      }))), 'Closed since last');
    }
    XLSX.writeFile(wb, `Claims_Pending_Report_${snap.label.replace(/\s+/g, '-')}.xlsx`);
  };

  const exportPDF = async () => {
    setBusy('pdf');
    const prevTab = tab;
    try {
      setTab('overview');
      await new Promise((r) => setTimeout(r, 450));
      const el = document.getElementById('cl-overview-capture');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const W = pdf.internal.pageSize.getWidth(); const H = pdf.internal.pageSize.getHeight();
      // Cover header
      pdf.setFillColor(8, 20, 40); pdf.rect(0, 0, W, 24, 'F');
      pdf.setFillColor(216, 178, 106); pdf.rect(0, 24, W, 1.2, 'F');
      pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
      pdf.text('Zuari Insurance Brokers · Claims Pending Report', 12, 11);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
      pdf.text(`Status as on ${snap.label}${prevSnap ? `  ·  compared with ${prevSnap.label}` : ''}  ·  Generated ${fmtDate(new Date())}`, 12, 18);
      let y = 30;
      if (el) {
        const canvas = await html2canvas(el, { scale: 1.6, backgroundColor: '#eef2f9', useCORS: true });
        const img = canvas.toDataURL('image/jpeg', 0.92);
        const iw = W - 20; const ih = (canvas.height * iw) / canvas.width;
        const fit = Math.min(ih, H - y - 8);
        const fw = (fit / ih) * iw;
        pdf.addImage(img, 'JPEG', (W - fw) / 2, y, fw, fit);
      }
      // Register table (text, paginated)
      const cols = [
        ['#', 8], ['Insured', 34], ['Nature of incidence', 52], ['Insurer', 32], ['Claimed', 22], ['Age', 14], ['Pending with', 20], [`Remark as on ${snap.label}`, 95],
      ];
      const header = () => {
        pdf.addPage(); y = 14;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(8, 20, 40);
        pdf.text(`Claims register (${filtered.length})  ·  ${snap.label}`, 10, y); y += 6;
        pdf.setFillColor(238, 242, 249); pdf.rect(8, y - 4, W - 16, 7, 'F');
        pdf.setFontSize(8); pdf.setTextColor(95, 111, 136);
        let x = 10; cols.forEach(([t, w]) => { pdf.text(t, x, y); x += w; }); y += 6;
      };
      header();
      pdf.setFont('helvetica', 'normal');
      filtered.forEach((r, i) => {
        const cells = [String(i + 1), r.insured, r.nature, r.insurer, fmtFull(r.current).replace('₹', 'Rs'), `${r.ageBand} mo`, r.party, `${r.change && r.change !== 'BASE' ? `[${r.change}] ` : ''}${r.remark}`];
        pdf.setFontSize(7.6);
        const wrapped = cells.map((c, ci) => pdf.splitTextToSize(String(c || '—'), cols[ci][1] - 2));
        const lines = Math.max(...wrapped.map((w) => w.length));
        const rh = lines * 3.3 + 2.4;
        if (y + rh > H - 8) header();
        if (i % 2) { pdf.setFillColor(250, 251, 254); pdf.rect(8, y - 3.2, W - 16, rh, 'F'); }
        pdf.setTextColor(34, 50, 77);
        let x = 10; wrapped.forEach((w, ci) => { pdf.text(w, x, y); x += cols[ci][1]; });
        y += rh;
      });
      // Updates section
      if (prevSnap && updated.length) {
        header();
        y -= 12; pdf.setFillColor(255, 255, 255); pdf.rect(8, y - 9, W - 16, 14, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(8, 20, 40);
        pdf.text(`What changed since ${prevSnap.label} (${updated.length} claims)`, 10, y - 2); y += 6;
        pdf.setFont('helvetica', 'normal');
        updated.forEach((r) => {
          const a = pdf.splitTextToSize(`Before: ${r.prev?.remark || '—'}`, (W - 30) / 2);
          const b = pdf.splitTextToSize(`Now: ${r.remark || '—'}`, (W - 30) / 2);
          const rh = Math.max(a.length, b.length) * 3.3 + 9;
          if (y + rh > H - 8) { pdf.addPage(); y = 14; }
          pdf.setFontSize(8.5); pdf.setTextColor(8, 20, 40); pdf.setFont('helvetica', 'bold');
          pdf.text(`${r.insured} · ${short(r.nature, 90)}`, 10, y); pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.6); pdf.setTextColor(95, 111, 136); pdf.text(a, 10, y + 5);
          pdf.setTextColor(27, 47, 85); pdf.text(b, 10 + (W - 30) / 2 + 10, y + 5);
          y += rh;
        });
      }
      pdf.save(`Claims_Pending_Report_${snap.label.replace(/\s+/g, '-')}.pdf`);
    } catch (e) {
      console.error(e); alert('Could not create the PDF. Please try again.');
    } finally { setTab(prevTab); setBusy(''); }
  };

  const remarkCount = (r) => new Set(r.trail.map((t) => t.remark.toLowerCase())).size;

  return (
    <div className="cl-page">
      {/* ---------- Header band with 3D ---------- */}
      <div className="cl-band">
        <div className="scene"><Suspense fallback={null}><DataScene variant="band" /></Suspense></div>
        <div className="cl-band-inner">
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={onBack}>← Dashboards</button>
              <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => addRef.current?.click()}>+ Add month</button>
              <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => { setSnapshots([]); setF({ party: 'all', age: 'all', insured: 'all', insurer: 'all', change: 'all', q: '' }); }}>Upload new</button>
              <input ref={addRef} type="file" accept=".xlsx,.xls" multiple hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
            </div>
            <span className="zi-chip">CLAIMS PENDING · NON-GHI</span>
            <h1 style={{ marginTop: 10 }}>Status as on {snap.label}</h1>
            <p>{rows.length} pending claims · {fmtINR(tCurrent)} claimed{prevSnap ? ` · compared with ${prevSnap.label}` : ''}</p>
            {multi && (
              <div className="cl-snap" role="tablist" aria-label="Snapshot month">
                {history.snaps.map((s, i) => (
                  <button key={s.id} className={i === idx ? 'on' : ''} onClick={() => setSnapIndex(i)}>{s.label} · {s.rows.length}</button>
                ))}
              </div>
            )}
            {error && <div className="zi-err" style={{ maxWidth: 640 }}>⚠ {error}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
            <button className="btn btn-gold" onClick={exportPDF} disabled={!!busy}>{busy === 'pdf' ? 'Preparing PDF…' : '⬇ Download PDF report'}</button>
            <button className="btn btn-ghost" onClick={exportExcel}>⬇ Excel with remarks history</button>
          </div>
        </div>
        <div style={{ height: 46 }} />
      </div>

      <div className="cl-main">
        {/* ---------- KPIs ---------- */}
        <div className="cl-kpis">
          <div className="cl-kpi" style={{ '--c': Z.azure }}><small>Pending claims</small><b>{rows.length}</b><span>{prevSnap ? `${rows.length - prevSnap.rows.length >= 0 ? '+' : ''}${rows.length - prevSnap.rows.length} vs ${prevSnap.label}` : `${new Set(rows.map((r) => r.insured)).size} insureds`}</span></div>
          <div className="cl-kpi" style={{ '--c': Z.gold }}><small>Amount claimed</small><b>{fmtINR(tCurrent)}</b><span>Initial {fmtINR(tInitial)}</span></div>
          <div className="cl-kpi" style={{ '--c': Z.teal }}><small>Settled so far</small><b>{fmtINR(tSettled)}</b><span>{rows.filter((r) => r.settled > 0).length} part-settled</span></div>
          <div className="cl-kpi" style={{ '--c': Z.rose }}><small>12+ months</small><b>{old.length}</b><span>{fmtINR(sum(old, 'current'))}</span></div>
          <div className="cl-kpi" style={{ '--c': Z.amber }}><small>Pending with insured</small><b>{rows.filter((r) => r.party === 'Insured').length}</b><span>Avg age {avgMonths.toFixed(1)} months</span></div>
          <div className="cl-kpi" style={{ '--c': Z.ink700 }}>
            <small>{prevSnap ? 'Movement' : 'Remarks'}</small>
            <b>{prevSnap ? `${updated.length} updated` : rows.filter((r) => r.remark).length}</b>
            <span>{prevSnap ? `${fresh.length} new · ${closed.length} closed` : 'claims with a status note'}</span>
          </div>
        </div>

        <div className="cl-tabs" role="tablist">
          {[['overview', 'Overview'], ['register', `Claims register (${filtered.length})`], ['remarks', prevSnap ? `What changed (${updated.length})` : 'Remarks'], ...(multi ? [['movement', 'Month movement']] : [])].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {/* ---------- Overview ---------- */}
        {tab === 'overview' && (
          <div id="cl-overview-capture" className="cl-grid" style={{ gap: 16 }}>
            <div className="cl-grid g3">
              <div className="cl-card">
                <h3>Pending with</h3><div className="sub">Who the next action sits with · click to filter</div>
                <div className="cl-chart"><Doughnut data={partyChart} options={chartOpts({ cutout: '64%', onClick: (_, els) => els[0] && drill({ party: partyAgg[els[0].index][0] }) })} /></div>
              </div>
              <div className="cl-card">
                <h3>Ageing</h3><div className="sub">Claims and amount by months pending</div>
                <div className="cl-chart"><Bar data={ageChart} options={chartOpts({ onClick: (_, els) => els[0] && drill({ age: AGE_BANDS[els[0].index] }), scales: { y: { beginAtZero: true, grid: { color: '#eef2f8' }, title: { display: true, text: 'Claims' } }, y1: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: moneyAxis.ticks } , x: { grid: { display: false } } } })} /></div>
              </div>
              <div className="cl-card">
                <h3>Policy line</h3><div className="sub">Derived from "Type of Policy"</div>
                <div className="cl-chart"><Doughnut data={lineChart} options={chartOpts({ cutout: '64%' })} /></div>
              </div>
            </div>
            <div className="cl-grid g2">
              <div className="cl-card">
                <h3>Top insureds by amount</h3><div className="sub">Click a bar to see its claims</div>
                <div className="cl-chart" style={{ height: 280 }}><Bar data={insuredChart} options={chartOpts({ indexAxis: 'y', plugins: { legend: { display: false } }, onClick: (_, els) => els[0] && drill({ insured: insuredAgg[els[0].index][0] }), scales: { x: moneyAxis, y: { grid: { display: false } } } })} /></div>
              </div>
              <div className="cl-card">
                {multi ? (
                  <>
                    <h3>Trend across months</h3><div className="sub">Pending claims and amount per snapshot</div>
                    <div className="cl-chart" style={{ height: 280 }}><Line data={trendChart} options={chartOpts({ scales: { y: { beginAtZero: true, grid: { color: '#eef2f8' } }, y1: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: moneyAxis.ticks } } })} /></div>
                  </>
                ) : (
                  <>
                    <h3>Insurers by amount</h3><div className="sub">Top insurers on pending claims</div>
                    <div className="cl-chart" style={{ height: 280 }}><Bar data={insurerChart} options={chartOpts({ indexAxis: 'y', plugins: { legend: { display: false } }, onClick: (_, els) => els[0] && drill({ insurer: insurerAgg[els[0].index][0] }), scales: { x: moneyAxis, y: { grid: { display: false } } } })} /></div>
                  </>
                )}
              </div>
            </div>
            <div className="cl-card">
              <h3>Oldest open claims</h3><div className="sub">Longest-pending first, with the latest remark</div>
              <div className="cl-feed" style={{ marginTop: 6 }}>
                {[...rows].sort((a, b) => b.months - a.months).slice(0, 5).map((r) => (
                  <div key={r.key} className="cl-feed-item" onClick={() => setOpen(r)}>
                    <div className="hd"><b>{r.insured}</b><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><AgeTag band={r.ageBand} /><PartyBadge party={r.party} /></span></div>
                    <div className="meta">{short(r.nature, 140)} · {r.months} months · {fmtINR(r.current)}</div>
                    <div className="cl-diff" style={{ gridTemplateColumns: '1fr' }}><div className="new"><small>Remark as on {snap.label}</small>{r.remark || '—'}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ---------- Register ---------- */}
        {tab === 'register' && (
          <div className="cl-card">
            <div className="cl-filters">
              <input placeholder="Search insured, incident, insurer, policy or remark…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
              <select value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })}><option value="all">Pending with: all</option>{parties.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              <select value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })}><option value="all">Age: all</option>{AGE_BANDS.map((b) => <option key={b} value={b}>{b} months</option>)}</select>
              <select value={f.insured} onChange={(e) => setF({ ...f, insured: e.target.value })}><option value="all">Insured: all</option>{insureds.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              <select value={f.insurer} onChange={(e) => setF({ ...f, insurer: e.target.value })}><option value="all">Insurer: all</option>{insurers.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              {prevSnap && <select value={f.change} onChange={(e) => setF({ ...f, change: e.target.value })}><option value="all">Change: all</option><option value="NEW">New</option><option value="UPDATED">Remark updated</option><option value="NO CHANGE">No change</option></select>}
              {Object.entries(f).some(([k, v]) => (k === 'q' ? v : v !== 'all')) && <button className="btn" style={{ padding: '8px 12px', background: '#f1f5fc', color: '#22324d' }} onClick={() => setF({ party: 'all', age: 'all', insured: 'all', insurer: 'all', change: 'all', q: '' })}>Clear filters</button>}
            </div>
            <div style={{ fontSize: 12, color: Z.muted, margin: '0 0 10px' }}>{filtered.length} of {rows.length} claims · {fmtINR(sum(filtered, 'current'))} · click a claim to open its remarks timeline</div>
            <div className="cl-table-wrap">
              <table className="cl-table">
                <thead>
                  <tr>
                    {[['sno', '#'], ['insured', 'Insured'], ['nature', 'Nature of incidence'], ['insurer', 'Insurer'], ['lossDate', 'Date of loss'], ['current', 'Claimed'], ['settled', 'Settled'], ['months', 'Age'], ['party', 'Pending with'], ['remark', `Remark as on ${snap.label}`]].map(([k, l]) => (
                      <th key={k} onClick={() => setSortKey(k)}>{l}{sort.k === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.key} onClick={() => setOpen(r)}>
                      <td>{r.sno}</td>
                      <td style={{ fontWeight: 700, minWidth: 150 }}>{r.insured}</td>
                      <td style={{ minWidth: 220, fontSize: 12.5 }}>{short(r.nature, 110)}</td>
                      <td style={{ minWidth: 150 }}>{r.insurer}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.lossDate)}</td>
                      <td className="num">{fmtINR(r.current)}{r.revised && r.revised !== r.initial ? <div style={{ fontSize: 10.5, color: Z.muted, fontWeight: 600 }}>initial {fmtINR(r.initial)}</div> : null}</td>
                      <td className="num" style={{ color: r.settled ? '#0f7c6f' : '#9aa8bf' }}>{r.settled ? fmtINR(r.settled) : '—'}</td>
                      <td><AgeTag band={r.ageBand} /><div style={{ fontSize: 11, color: Z.muted, marginTop: 3 }}>{r.months} mo</div></td>
                      <td><PartyBadge party={r.party} /></td>
                      <td className="remark">{short(r.remark, 150)}<ChangeTag change={r.change} />{remarkCount(r) > 1 && <div style={{ fontSize: 11, color: Z.azure, fontWeight: 700, marginTop: 4 }}>{r.trail.length} updates in history →</div>}</td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td colSpan={10} className="cl-empty">No claims match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------- Remarks / what changed ---------- */}
        {tab === 'remarks' && (
          <div className="cl-grid" style={{ gap: 18 }}>
            {prevSnap ? (
              <>
                <div>
                  <div className="zi-section-title" style={{ margin: '4px 0 12px' }}>REMARKS UPDATED SINCE {prevSnap.label.toUpperCase()} · {updated.length}</div>
                  <div className="cl-feed">
                    {updated.map((r) => (
                      <div key={r.key} className="cl-feed-item" onClick={() => setOpen(r)}>
                        <div className="hd"><b>{r.insured}</b><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><AgeTag band={r.ageBand} />{r.prev && r.prev.party !== r.party && <><PartyBadge party={r.prev.party} /><span style={{ color: Z.muted }}>→</span></>}<PartyBadge party={r.party} /></span></div>
                        <div className="meta">{short(r.nature, 140)} · {r.insurer} · {fmtINR(r.current)}</div>
                        <div className="cl-diff">
                          <div className="old"><small>{prevSnap.label}</small>{r.prev?.remark || '—'}</div>
                          <div className="new"><small>{snap.label}</small>{r.remark || '—'}</div>
                        </div>
                      </div>
                    ))}
                    {!updated.length && <div className="cl-empty">No remarks changed between these months.</div>}
                  </div>
                </div>
                <div className="cl-grid g2">
                  <div>
                    <div className="zi-section-title" style={{ margin: '4px 0 12px' }}>NEW CLAIMS · {fresh.length}</div>
                    <div className="cl-feed">
                      {fresh.map((r) => (
                        <div key={r.key} className="cl-feed-item" onClick={() => setOpen(r)}>
                          <div className="hd"><b>{r.insured}</b><PartyBadge party={r.party} /></div>
                          <div className="meta">{short(r.nature, 120)} · {fmtINR(r.current)}</div>
                          <div style={{ fontSize: 12.5, marginTop: 8, color: '#22324d' }}>{r.remark}</div>
                        </div>
                      ))}
                      {!fresh.length && <div className="cl-empty">No new claims this month.</div>}
                    </div>
                  </div>
                  <div>
                    <div className="zi-section-title" style={{ margin: '4px 0 12px' }}>NO MOVEMENT · {stale.length}</div>
                    <div className="cl-feed">
                      {[...stale].sort((a, b) => b.months - a.months).map((r) => (
                        <div key={r.key} className="cl-feed-item" onClick={() => setOpen(r)}>
                          <div className="hd"><b>{r.insured}</b><span style={{ display: 'flex', gap: 6 }}><AgeTag band={r.ageBand} /><PartyBadge party={r.party} /></span></div>
                          <div className="meta">Same remark for {r.unchangedSnaps} snapshot{r.unchangedSnaps > 1 ? 's' : ''} · {fmtINR(r.current)}</div>
                          <div style={{ fontSize: 12.5, marginTop: 8, color: '#22324d' }}>{r.remark}</div>
                        </div>
                      ))}
                      {!stale.length && <div className="cl-empty">Every claim moved this month.</div>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="cl-card" style={{ background: '#fffaf0', borderColor: '#f2e2bd' }}>
                  <b style={{ fontSize: 13 }}>Tip:</b> <span style={{ fontSize: 13 }}>add last month's file with <b>+ Add month</b> to see exactly which remarks changed, which claims are new and which were closed.</span>
                </div>
                {['Insurer', 'Surveyor', 'Insured', 'Other', 'Unspecified'].filter((p) => rows.some((r) => r.party === p)).map((p) => (
                  <div key={p}>
                    <div className="zi-section-title" style={{ margin: '4px 0 12px' }}>PENDING WITH {p.toUpperCase()} · {rows.filter((r) => r.party === p).length}</div>
                    <div className="cl-feed">
                      {rows.filter((r) => r.party === p).sort((a, b) => b.months - a.months).map((r) => (
                        <div key={r.key} className="cl-feed-item" onClick={() => setOpen(r)}>
                          <div className="hd"><b>{r.insured}</b><AgeTag band={r.ageBand} /></div>
                          <div className="meta">{short(r.nature, 120)} · {fmtINR(r.current)}</div>
                          <div style={{ fontSize: 12.5, marginTop: 8, color: '#22324d' }}>{r.remark || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ---------- Movement ---------- */}
        {tab === 'movement' && (
          <div className="cl-grid" style={{ gap: 16 }}>
            {!prevSnap ? (
              <div className="cl-card cl-empty">Select a later month in the header to compare it with the month before.</div>
            ) : (
              <>
                <div className="cl-grid g3">
                  <div className="cl-card" style={{ borderTop: `3px solid ${Z.teal}` }}><h3>{fresh.length} new claims</h3><div className="sub">Reported after {prevSnap.label} · {fmtINR(sum(fresh, 'current'))}</div></div>
                  <div className="cl-card" style={{ borderTop: `3px solid ${Z.azure}` }}><h3>{updated.length} remarks updated</h3><div className="sub">{rows.filter((r) => r.prev && r.prev.party !== r.party).length} moved to a different party</div></div>
                  <div className="cl-card" style={{ borderTop: `3px solid ${Z.gold}` }}><h3>{closed.length} dropped off</h3><div className="sub">On {prevSnap.label} list, not on {snap.label} (closed / settled) · {fmtINR(sum(closed, 'current'))}</div></div>
                </div>
                <div className="cl-card">
                  <h3>Pending-with transitions</h3><div className="sub">{prevSnap.label} → {snap.label} for claims on both lists</div>
                  <div className="cl-table-wrap" style={{ marginTop: 8 }}>
                    <table className="cl-table">
                      <thead><tr><th>From</th><th>To</th><th>Claims</th><th>Amount</th></tr></thead>
                      <tbody>
                        {Object.entries(rows.filter((r) => r.prev).reduce((m, r) => { const k = `${r.prev.party}→${r.party}`; m[k] = m[k] || { n: 0, a: 0 }; m[k].n += 1; m[k].a += r.current; return m; }, {}))
                          .sort((a, b) => b[1].n - a[1].n)
                          .map(([k, v]) => { const [a, b] = k.split('→'); return (
                            <tr key={k} style={{ cursor: 'default' }}><td><PartyBadge party={a} /></td><td><PartyBadge party={b} /></td><td style={{ fontWeight: 800 }}>{v.n}</td><td className="num" style={{ textAlign: 'left' }}>{fmtINR(v.a)}</td></tr>
                          ); })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="cl-card">
                  <h3>Dropped off since {prevSnap.label}</h3><div className="sub">Last remark recorded before the claim left the list</div>
                  <div className="cl-feed" style={{ marginTop: 8 }}>
                    {closed.map((r) => (
                      <div key={r.key} className="cl-feed-item" onClick={() => setOpen({ ...r, change: 'CLOSED' })}>
                        <div className="hd"><b>{r.insured}</b><span className="cl-badge" style={{ background: Z.tealSoft, color: '#0f7c6f' }}><i />Off the list</span></div>
                        <div className="meta">{short(r.nature, 140)} · {r.insurer} · {fmtINR(r.current)}</div>
                        <div style={{ fontSize: 12.5, marginTop: 8, color: '#22324d' }}>Last remark ({r.label}): {r.remark || '—'}</div>
                      </div>
                    ))}
                    {!closed.length && <div className="cl-empty">No claims left the list.</div>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---------- Claim drawer: remarks timeline ---------- */}
      {open && (
        <>
          <div className="cl-overlay" onClick={() => setOpen(null)} />
          <aside className="cl-drawer" role="dialog" aria-label={`Claim ${open.insured}`}>
            <div className="cl-drawer-hd">
              <button className="cl-close" onClick={() => setOpen(null)} aria-label="Close">✕</button>
              <h2>{open.insured}</h2>
              <p>{open.nature}</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}><PartyBadge party={open.party} /><AgeTag band={open.ageBand} />{open.change === 'CLOSED' ? <span className="cl-chg" style={{ background: Z.tealSoft, color: '#0f7c6f' }}>OFF THE LIST</span> : <ChangeTag change={open.change} />}</div>
            </div>
            <div className="cl-facts">
              <div><small>Insurer</small><b>{open.insurer || '—'}</b></div>
              <div><small>Date of loss</small><b>{fmtDate(open.lossDate)}</b></div>
              <div><small>Months pending</small><b>{open.months}</b></div>
              <div><small>Initial claimed</small><b>{fmtFull(open.initial)}</b></div>
              <div><small>Revised claimed</small><b>{open.revised ? fmtFull(open.revised) : '—'}</b></div>
              <div><small>Settled</small><b>{open.settled ? fmtFull(open.settled) : '—'}</b></div>
              <div style={{ gridColumn: '1 / -1' }}><small>Type of policy</small><b style={{ fontWeight: 600, fontSize: 13 }}>{open.policy || '—'}</b></div>
              <div style={{ gridColumn: '1 / -1' }}><small>Status</small><b style={{ fontWeight: 600, fontSize: 13 }}>{open.status || '—'}</b></div>
            </div>
            <div className="cl-sec">
              <h4>Remarks timeline · {open.trail.length} snapshot{open.trail.length > 1 ? 's' : ''}</h4>
              <div className="cl-timeline">
                {[...open.trail].reverse().map((t, i, arr) => {
                  const older = arr[i + 1];
                  const changed = older && older.remark.toLowerCase() !== t.remark.toLowerCase();
                  return (
                    <div key={t.snapId} className={`cl-tl ${i === 0 ? 'latest' : ''}`}>
                      <div className="when">
                        Status as on {t.label}
                        <PartyBadge party={t.party} />
                        {older && <span className="cl-chg" style={changed ? { background: Z.azureSoft, color: '#1f4fb8' } : { background: '#f1f3f7', color: '#6b7a92' }}>{changed ? 'UPDATED' : 'SAME AS BEFORE'}</span>}
                        {!older && arr.length > 1 && <span className="cl-chg" style={{ background: Z.tealSoft, color: '#0f7c6f' }}>FIRST SEEN</span>}
                      </div>
                      <div className="bubble">{t.remark || <i style={{ color: Z.muted }}>No remark recorded</i>}</div>
                      <div style={{ fontSize: 11, color: Z.muted, marginTop: 4 }}>{t.months} months · {fmtINR(t.revised || t.initial)}{t.settled ? ` · settled ${fmtINR(t.settled)}` : ''}</div>
                    </div>
                  );
                })}
              </div>
              {open.trail.length < 2 && <div style={{ fontSize: 12, color: Z.muted }}>Upload earlier months to build this claim's history.</div>}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
