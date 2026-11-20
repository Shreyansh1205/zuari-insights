import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { UploadScreen } from './BusinessModule';
import useStoredFiles from '../hooks/useStoredFiles';
import DashBand, { Kpi, ICON } from '../components/DashBand';
import { initials } from '../api';
import { Z } from '../theme';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

/* ---------- clean-up helpers ---------- */
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\s+/g, ' ').trim();
const STATES_IN = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman & Nicobar',
  'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu', 'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];
/* short forms, old names and cities that people type into the State column */
const STATE_ALIASES = {
  up: 'Uttar Pradesh', mp: 'Madhya Pradesh', ap: 'Andhra Pradesh', wb: 'West Bengal', hp: 'Himachal Pradesh', tn: 'Tamil Nadu', jk: 'Jammu & Kashmir',
  uk: 'Uttarakhand', orissa: 'Odisha', 'new delhi': 'Delhi', ncr: 'Delhi', 'nct of delhi': 'Delhi', 'delhi ncr': 'Delhi', uttaranchal: 'Uttarakhand',
  pondicherry: 'Puducherry', 'jammu and kashmir': 'Jammu & Kashmir', chennai: 'Tamil Nadu', madras: 'Tamil Nadu', mumbai: 'Maharashtra', bombay: 'Maharashtra',
  pune: 'Maharashtra', kolkata: 'West Bengal', calcutta: 'West Bengal', bangalore: 'Karnataka', bengaluru: 'Karnataka', hyderabad: 'Telangana',
  gurgaon: 'Haryana', gurugram: 'Haryana', faridabad: 'Haryana', noida: 'Uttar Pradesh', lucknow: 'Uttar Pradesh', patiala: 'Punjab', ludhiana: 'Punjab',
  bhubaneswar: 'Odisha', jaipur: 'Rajasthan', ahmedabad: 'Gujarat', bhopal: 'Madhya Pradesh', patna: 'Bihar', ranchi: 'Jharkhand', guwahati: 'Assam',
};
const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
};
const stateCache = new Map();
const cleanState = (s) => {
  const t = String(s || '').toLowerCase().replace(/[^a-z& ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return 'Unknown';
  if (stateCache.has(t)) return stateCache.get(t);
  let out = STATE_ALIASES[t] || STATES_IN.find((st) => st.toLowerCase().replace(/[^a-z]/g, '') === t.replace(/[^a-z]/g, ''));
  if (!out) {
    const flat = t.replace(/ /g, '');
    let best = null; let dist = 99;
    STATES_IN.forEach((st) => { const dd = lev(flat, st.toLowerCase().replace(/[^a-z&]/g, '')); if (dd < dist) { dist = dd; best = st; } });
    // short codes must be a known alias ("NA" is not Goa); long notes like "As per brokerage statement" → Unknown
    out = flat.length >= 4 && dist <= Math.max(2, Math.floor(flat.length * 0.3)) ? best : 'Unknown';
  }
  stateCache.set(t, out);
  return out;
};
const cleanCity = (s) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t ? titleCase(t) : 'Unknown'; };
const digits = (s) => String(s || '').replace(/\D/g, '');
/* 9999999999, 9999991234, 0000000000, 1234567890 … are placeholders, not real numbers */
const isPlaceholderMobile = (m) => {
  const d = digits(m).slice(-10);
  return !d || /^(\d)\1{9}$/.test(d) || /^9{5}/.test(d) || d === '1234567890';
};
const validMobile = (m) => { const d = digits(m).slice(-10); return d.length === 10 && /^[6-9]/.test(d) && !isPlaceholderMobile(m); };
const INTERNAL_DOMAIN = /@zuari(insurance)?\.(in|com)$/i;

function parseCustomerExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];

        // Try multiple header rows (title rows often sit above)
        let rows = [];
        for (let r = 0; r <= 3; r++) {
          const candidate = XLSX.utils.sheet_to_json(sheet, { defval: '', range: r });
          if (!candidate.length) continue;
          const keys = Object.keys(candidate[0]).map(k => k.toLowerCase());
          if (keys.some(k => k.includes('customer') || k.includes('custname') || k.includes('custcode') || k === 'name')) { rows = candidate; break; }
        }
        if (!rows.length) rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!rows.length) return reject(new Error('No data rows found in file'));

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

        const nameCol = find(['Customer Name', 'CustName', 'Cust Name', 'Name']);
        const codeCol = find(['CustCode', 'Cust Code', 'Customer Code', 'Code']);
        const stateCol = find(['State']);
        const cityCol = find(['City']);
        const mobileCol = find(['Mobile', 'Phone', 'PhoneNo', 'Contact No']);
        const emailCol = find(['Email ID', 'Email'], /2/);
        const email2Col = find(['Email ID 2', 'Email 2', 'Alternate Email']);

        const data = rows.map((r, i) => {
          const emails = [...new Set([r[emailCol], email2Col ? r[email2Col] : ''].map(x => String(x || '').trim().toLowerCase()).filter(x => /@/.test(x)))];
          const mobile = String(r[mobileCol] || '').trim();
          return {
            id: i,
            name: String(r[nameCol] || '').replace(/\s+/g, ' ').trim(),
            code: String(r[codeCol] || '').trim(),
            state: cleanState(r[stateCol]),
            rawState: String(r[stateCol] || '').trim(),
            city: cleanCity(r[cityCol]),
            mobile,
            mobileOk: validMobile(mobile),
            mobilePlaceholder: !!digits(mobile) && isPlaceholderMobile(mobile),
            emails,
            email: emails[0] || '',
            emailInternal: emails.length > 0 && emails.every(x => INTERNAL_DOMAIN.test(x)),
          };
        }).filter(r => r.name && r.name.toLowerCase() !== 'customer name' && r.name.length > 1);

        if (!data.length) return reject(new Error('Could not find customer rows. Check column headers.'));
        resolve({ fileName: file.name, rows: data });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

const COVERAGE = [
  ['both', 'Email + mobile', Z.teal],
  ['mobile', 'Mobile only', Z.azure],
  ['email', 'Email only', Z.gold],
  ['none', 'No usable contact', Z.rose],
];
const coverageOf = (r) => {
  const e = !!r.email && !r.emailInternal;
  return e && r.mobileOk ? 'both' : r.mobileOk ? 'mobile' : e ? 'email' : 'none';
};
const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const chartOpts = (extra = {}) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 12 } }, tooltip: { padding: 10, cornerRadius: 10 } },
  ...extra,
});

export default function CustomerModule({ onBack }) {
  const [data, setData] = useState([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [contact, setContact] = useState('all');
  const [sort, setSort] = useState({ k: 'name', dir: 1 });
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
      const parsed = await parseCustomerExcel(file);
      setData(parsed.rows); setFileName(parsed.fileName);
      setStateFilter('all'); setCityFilter('all'); setContact('all'); setSearch('');
      if (!fromServer) await store.save([file]);   // replaces the previous file on the server
    } catch (err) { setError(err.message || 'Failed to parse file'); }
    finally { setLoading(false); }
  };

  const store = useStoredFiles('customers', (files) => handleFiles(files, true));

  const states = useMemo(() => [...new Set(data.map(r => r.state))].filter(s => s !== 'Unknown').sort(), [data]);
  const allCities = useMemo(() => [...new Set(data.map(r => r.city))].filter(c => c !== 'Unknown'), [data]);
  const cities = useMemo(() => {
    const list = stateFilter === 'all' ? data : data.filter(r => r.state === stateFilter);
    return [...new Set(list.map(r => r.city))].filter(c => c !== 'Unknown').sort();
  }, [data, stateFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(r => {
      if (stateFilter !== 'all' && r.state !== stateFilter) return false;
      if (cityFilter !== 'all' && r.city !== cityFilter) return false;
      if (contact !== 'all') {
        if (contact === 'placeholder' ? !r.mobilePlaceholder : contact === 'internal' ? !r.emailInternal : coverageOf(r) !== contact) return false;
      }
      if (q) return `${r.name} ${r.code} ${r.city} ${r.state} ${r.emails.join(' ')} ${r.mobile}`.toLowerCase().includes(q);
      return true;
    }).sort((a, b) => {
      const x = a[sort.k] ?? ''; const y = b[sort.k] ?? '';
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * sort.dir;
    });
  }, [data, search, stateFilter, cityFilter, contact, sort]);
  const setSortKey = (k) => setSort((s) => ({ k, dir: s.k === k ? -s.dir : 1 }));

  // ---------- analytics ----------
  const stateDist = useMemo(() => {
    const m = {};
    data.forEach(r => { m[r.state] = (m[r.state] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [data]);
  const cityDist = useMemo(() => {
    const m = {};
    data.forEach(r => { if (r.city !== 'Unknown') { const k = `${r.city}|${r.state}`; m[k] = (m[k] || 0) + 1; } });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => { const [city, state] = k.split('|'); return { city, state, n: v }; });
  }, [data]);
  const cov = useMemo(() => {
    const m = { both: 0, mobile: 0, email: 0, none: 0 };
    data.forEach(r => { m[coverageOf(r)] += 1; });
    return m;
  }, [data]);
  const withEmail = data.filter(r => r.email && !r.emailInternal).length;
  const withMobile = data.filter(r => r.mobileOk).length;
  const placeholders = data.filter(r => r.mobilePlaceholder).length;
  const internal = data.filter(r => r.emailInternal).length;
  const merged = useMemo(() => {
    const m = {};
    data.forEach(r => { if (r.rawState && r.rawState.toLowerCase().replace(/[^a-z]/g, '') !== r.state.toLowerCase().replace(/[^a-z]/g, '')) { m[r.state] = m[r.state] || new Set(); m[r.state].add(r.rawState.trim()); } });
    return Object.entries(m).map(([s, set]) => `${[...set].join(', ')} → ${s}`);
  }, [data]);

  const stateChart = {
    labels: stateDist.map(([s]) => s),
    datasets: [{ label: 'Customers', data: stateDist.map(([, n]) => n), backgroundColor: stateDist.map(([s]) => (s === stateFilter ? Z.gold : Z.azure)), borderRadius: 8, maxBarThickness: 26 }],
  };
  const covChart = {
    labels: COVERAGE.map(([, l]) => l),
    datasets: [{ data: COVERAGE.map(([k]) => cov[k]), backgroundColor: COVERAGE.map(([, , c]) => c), borderWidth: 0, hoverOffset: 8 }],
  };

  // ---------- exports ----------
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtered.map((r, i) => ({
      '#': i + 1, 'Customer Name': r.name, 'Cust Code': r.code, State: r.state, City: r.city,
      Mobile: r.mobile, 'Mobile usable': r.mobileOk ? 'Yes' : r.mobilePlaceholder ? 'Placeholder' : 'No',
      Email: r.emails.join(', '), 'Contact coverage': COVERAGE.find(([k]) => k === coverageOf(r))[1],
    }))), 'Customers');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stateDist.map(([s, n]) => ({ State: s, Customers: n }))), 'By State');
    XLSX.writeFile(wb, 'Customer_Master_Report.xlsx');
  };
  const downloadPDF = async () => {
    const el = document.getElementById('customer-content');
    if (!el) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(el, { scale: 1.4, backgroundColor: '#eef2f9' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const W = pdf.internal.pageSize.getWidth(); const H = pdf.internal.pageSize.getHeight();
      pdf.setFillColor(8, 20, 40); pdf.rect(0, 0, W, 20, 'F'); pdf.setFillColor(216, 178, 106); pdf.rect(0, 20, W, 1, 'F');
      pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.text('Zuari Insurance Brokers · Customer Master', 10, 9);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(`${data.length} customers · ${fileName} · generated ${new Date().toLocaleDateString('en-GB')}`, 10, 15);
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
      pdf.save('Customer_Master_Report.pdf');
    } catch (e) { alert('Could not create the PDF. Please try again.'); }
    finally { setBusy(false); }
  };

  if (!data.length) {
    return (
      <UploadScreen
        title="Customer Master"
        desc="Upload Customer Data Excel to view customer list, contacts and locations."
        color="#2f7bff"
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
        features={['Search & filters', 'State / City analytics', 'Contact coverage', 'PDF + Excel export']}
      />
    );
  }

  const clearFilters = () => { setStateFilter('all'); setCityFilter('all'); setContact('all'); setSearch(''); };
  const anyFilter = stateFilter !== 'all' || cityFilter !== 'all' || contact !== 'all' || search;
  const jump = () => setTimeout(() => document.getElementById('cu-register')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  const SortTh = ({ k, children, className }) => (
    <th className={className} onClick={() => setSortKey(k)}>{children}{sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
  );

  return (
    <div className="cl-page">
      <DashBand
        chip="CUSTOMER MASTER"
        title="Customer directory"
        subtitle={`${data.length} customers · ${states.length} states · ${allCities.length} cities`}
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

      <div className="cl-main" id="customer-content">
        <div className="cl-kpis">
          <Kpi label="Customers" value={data.length} hint={`${new Set(data.map(r => r.code).filter(Boolean)).size} unique codes`} color={Z.azure} icon={ICON.users} />
          <Kpi label="States" value={states.length} hint={stateDist[0] ? `Most in ${stateDist[0][0]}` : ''} color={Z.ink700} icon={ICON.map} />
          <Kpi label="Cities" value={allCities.length} hint={cityDist[0] ? `Top: ${cityDist[0].city}` : ''} color={Z.teal} icon={ICON.pin} />
          <Kpi label="Email on file" value={`${pct(withEmail, data.length)}%`} hint={`${withEmail} customers`} color={Z.gold} icon={ICON.mail} />
          <Kpi label="Usable mobile" value={`${pct(withMobile, data.length)}%`} hint={`${withMobile} · ${placeholders} placeholders`} color={Z.amber} icon={ICON.phone} />
          <Kpi label="Fully reachable" value={`${pct(cov.both, data.length)}%`} hint={`${cov.both} with email + mobile`} color={Z.rose} icon={ICON.check} />
        </div>

        <div className="cl-grid ds-g3" style={{ marginTop: 18 }}>
          <div className="cl-card">
            <h3>Customers by state</h3><div className="sub">Top {stateDist.length} · click a bar to filter the list</div>
            <div className="cl-chart" style={{ height: 300 }}>
              <Bar data={stateChart} options={chartOpts({
                indexAxis: 'y', plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, grid: { color: '#eef2f8' }, ticks: { precision: 0 } }, y: { grid: { display: false } } },
                onClick: (_, els) => { if (els[0]) { const s = stateDist[els[0].index][0]; setStateFilter(v => (v === s ? 'all' : s)); setCityFilter('all'); jump(); } },
              })} />
            </div>
          </div>
          <div className="cl-card">
            <h3>Contact coverage</h3><div className="sub">Can we reach this customer? Click a segment to filter</div>
            <div className="cl-chart" style={{ height: 210 }}>
              <Doughnut data={covChart} options={chartOpts({
                cutout: '68%', plugins: { legend: { display: false } },
                onClick: (_, els) => { if (els[0]) { setContact(COVERAGE[els[0].index][0]); jump(); } },
              })} />
              <div className="ds-donut-mid"><b>{pct(cov.both, data.length)}%</b><span>fully reachable</span></div>
            </div>
            <ul className="ds-legend">
              {COVERAGE.map(([k, l, c]) => (
                <li key={k} className={contact === k ? 'on' : ''} onClick={() => { setContact(v => (v === k ? 'all' : k)); jump(); }}>
                  <i style={{ background: c }} /><span>{l}</span><b>{cov[k]}</b>
                </li>
              ))}
            </ul>
          </div>
          <div className="cl-card">
            <h3>Top cities</h3><div className="sub">Where most customers are based</div>
            <ul className="ds-rank">
              {cityDist.map((c, i) => (
                <li key={`${c.city}${c.state}`} onClick={() => { setStateFilter(c.state); setCityFilter(c.city); jump(); }}>
                  <span className="n">{i + 1}</span>
                  <div className="t"><b>{c.city}</b><small>{c.state}</small></div>
                  <div className="bar"><i style={{ width: `${(c.n / cityDist[0].n) * 100}%` }} /></div>
                  <b className="v">{c.n}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {(placeholders > 0 || internal > 0 || merged.length > 0) && (
          <div className="ds-quality">
            <b>Data quality</b>
            {placeholders > 0 && <button onClick={() => { setContact('placeholder'); jump(); }}>{placeholders} placeholder mobile numbers (e.g. 9999999999)</button>}
            {internal > 0 && <button onClick={() => { setContact('internal'); jump(); }}>{internal} customers have only a Zuari staff email</button>}
            {merged.length > 0 && <span title={merged.join('\n')}>{merged.reduce((a, x) => a + x.split(',').length, 0)} state spellings corrected (hover to see) · e.g. {merged[0]}</span>}
          </div>
        )}

        <div id="cu-register" className="cl-card" style={{ marginTop: 18 }}>
          <div className="ds-reg-hd">
            <div><h3>Customer register</h3><div className="sub">{filtered.length} of {data.length} customers{anyFilter ? ' · filtered' : ''}</div></div>
            {anyFilter && <button className="ds-clear" onClick={clearFilters}>Clear filters ✕</button>}
          </div>
          <div className="cl-filters">
            <input placeholder="Search name, code, city, email, mobile…" value={search} onChange={e => setSearch(e.target.value)} />
            <select value={stateFilter} onChange={e => { setStateFilter(e.target.value); setCityFilter('all'); }}>
              <option value="all">All states</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}>
              <option value="all">All cities</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={contact} onChange={e => setContact(e.target.value)}>
              <option value="all">Any contact status</option>
              {COVERAGE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              <option value="placeholder">Placeholder mobile</option>
              <option value="internal">Only Zuari staff email</option>
            </select>
          </div>
          <div className="cl-table-wrap">
            <table className="cl-table ds-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <SortTh k="name">Customer</SortTh>
                  <SortTh k="code">Code</SortTh>
                  <SortTh k="state">Location</SortTh>
                  <th>Mobile</th>
                  <th>Email</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const cv = COVERAGE.find(([k]) => k === coverageOf(r));
                  return (
                    <tr key={r.id}>
                      <td className="muted">{i + 1}</td>
                      <td><div className="ds-who"><span className="zi-avatar xs ds-av">{initials(r.name)}</span><b>{r.name}</b></div></td>
                      <td className="mono">{r.code || '—'}</td>
                      <td><b className="city">{r.city}</b><small className="st">{r.state}</small></td>
                      <td className="mono">
                        {r.mobileOk ? <a href={`tel:${digits(r.mobile).slice(-10)}`} onClick={e => e.stopPropagation()}>{r.mobile}</a>
                          : r.mobilePlaceholder ? <span className="ds-flag">{r.mobile} · placeholder</span> : <span className="muted">—</span>}
                      </td>
                      <td>
                        {r.emails.length ? r.emails.map(m => (
                          <a key={m} className={`ds-mail${INTERNAL_DOMAIN.test(m) ? ' internal' : ''}`} href={`mailto:${m}`} title={INTERNAL_DOMAIN.test(m) ? 'Zuari staff address' : ''}>{m}</a>
                        )) : <span className="muted">—</span>}
                      </td>
                      <td><span className="cl-badge" style={{ background: tint(cv[2], 0.13), color: cv[2] === Z.gold ? '#8a6a2c' : cv[2] }}><i />{cv[1]}</span></td>
                    </tr>
                  );
                })}
                {!filtered.length && <tr><td colSpan={7} className="cl-empty">No customers match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}