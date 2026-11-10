import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { UploadScreen } from './BusinessModule';
import { headerStyle } from '../theme';

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
          if (keys.some(k => k.includes('name') || k.includes('company') || k.includes('designation'))) {
            rows = candidate;
            break;
          }
        }
        if (!rows.length) rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!rows.length) return reject(new Error('No data found'));

        const keys = Object.keys(rows[0] || {});
        const find = (names) => {
          for (const n of names) {
            const hit = keys.find(k => k && k.toString().trim().toLowerCase() === n.toLowerCase());
            if (hit) return hit;
          }
          for (const n of names) {
            const hit = keys.find(k => k && k.toString().toLowerCase().includes(n.toLowerCase()));
            if (hit) return hit;
          }
          return null;
        };

        const data = rows.map((r, i) => ({
          id: i,
          name: String(r[find(['Name'])] || '').trim(),
          designation: String(r[find(['Designation'])] || '').trim(),
          company: String(r[find(['Company Name', 'Company'])] || '').trim(),
          location: String(r[find(['Location'])] || '').trim(),
          firstInteraction: r[find(['First Interaction Date', 'First Interaction'])] || '',
          lastGreeting: r[find(['Last Greeting Sent', 'Last Greeting'])] || '',
          interactionDate: r[find(['Interaction Date'])] || ''
        })).filter(r => r.name && r.name.length > 1);

        if (!data.length) return reject(new Error('No contact rows found'));
        resolve({ fileName: file.name, rows: data });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read'));
    reader.readAsArrayBuffer(file);
  });
}

function fmtDate(v) {
  if (!v) return '—';
  if (v instanceof Date) return v.toLocaleDateString('en-IN');
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN');
  }
  const s = String(v);
  if (s.toUpperCase().includes('PENDING') || s.toUpperCase().includes('MEETING')) return s;
  return s;
}

export default function MeetsModule({ onBack }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // all | done | pending
  const inputRef = useRef(null);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => /\.xlsx?$/i.test(f.name));
    if (!files.length) { setError('Upload .xlsx or .xls'); return; }
    setLoading(true); setError('');
    try {
      const parsed = await parseMeetsExcel(files[0]);
      setData(parsed.rows);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const companies = useMemo(() => [...new Set(data.map(r => r.company))].filter(Boolean).sort(), [data]);
  const isDone = (r) => {
    const v = r.interactionDate;
    if (!v) return false;
    const s = String(v).toUpperCase();
    if (s.includes('PENDING') || s === '' || s === '—') return false;
    return true;
  };
  const withMeeting = data.filter(isDone).length;
  const pending = data.length - withMeeting;

  // Company-wise meeting stats
  const companyStats = useMemo(() => {
    const m = {};
    data.forEach(r => {
      if (!m[r.company]) m[r.company] = { total: 0, done: 0 };
      m[r.company].total++;
      if (isDone(r)) m[r.company].done++;
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  }, [data]);

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (companyFilter !== 'all' && r.company !== companyFilter) return false;
      if (statusFilter === 'done' && !isDone(r)) return false;
      if (statusFilter === 'pending' && isDone(r)) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.name.toLowerCase().includes(q) || r.company.toLowerCase().includes(q) ||
          r.designation.toLowerCase().includes(q) || r.location.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, search, companyFilter, statusFilter]);

  const downloadPDF = async () => {
    const el = document.getElementById('meets-content');
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { scale: 1.4, backgroundColor: '#eef2f9' });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      let left = h, pos = 0;
      pdf.addImage(img, 'PNG', 0, pos, w, h);
      left -= pdf.internal.pageSize.getHeight();
      while (left > 0) {
        pos = left - h;
        pdf.addPage();
        pdf.addImage(img, 'PNG', 0, pos, w, h);
        left -= pdf.internal.pageSize.getHeight();
      }
      pdf.save('customer-meets.pdf');
    } catch (e) { alert('PDF failed'); }
  };

  if (!data.length) {
    return (
      <UploadScreen
        title="Customer Meets"
        desc="Upload Customer Meet Excel to track meetings, greetings and follow-ups."
        color="#d8b26a"
        loading={loading}
        error={error}
        dragOver={dragOver}
        setDragOver={setDragOver}
        onFiles={handleFiles}
        onBack={onBack}
        inputRef={inputRef}
        features={['Meeting status', 'Company analytics', 'Follow-up tracking', 'PDF Export']}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9' }}>
      <header style={styles.headerPurple}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={styles.btnGhost} onClick={onBack}>← Modules</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Customer Meets</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{data.length} contacts</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.btnGhost} onClick={downloadPDF}>⬇ PDF</button>
          <button style={styles.btnGhost} onClick={() => setData([])}>Upload New</button>
        </div>
      </header>

      <div id="meets-content">
        <div style={styles.kpiRow}>
          <Kpi label="Total Contacts" value={data.length} color="#b8913f" />
          <Kpi label="Companies" value={companies.length} color="#2f7bff" />
          <Kpi label="Meetings Done" value={withMeeting} color="#159a8a" />
          <Kpi label="Pending" value={pending} color="#c93b52" />
        </div>

        {/* Company analytics */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Meetings by Company (Top 8)</h3>
            {companyStats.map(([co, st]) => (
              <div key={co} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 180, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co}</span>
                <div style={{ flex: 1, height: 8, background: '#e3e9f3', borderRadius: 4 }}>
                  <div style={{ width: `${(st.done / st.total) * 100}%`, height: '100%', background: '#d8b26a', borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, width: 60 }}>{st.done}/{st.total}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status chips */}
        <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8 }}>
          {[['all', 'All'], ['done', 'Done'], ['pending', 'Pending']].map(([v, l]) => (
            <span key={v} style={{ ...styles.chip, ...(statusFilter === v ? styles.chipActive : {}) }}
              onClick={() => setStatusFilter(v)}>{l}</span>
          ))}
        </div>

        <div style={{ padding: '0 20px 32px' }}>
          <div style={styles.toolbar}>
            <input style={styles.search} placeholder="Search name, company, designation…" value={search} onChange={e => setSearch(e.target.value)} />
            <select style={styles.select} value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
              <option value="all">All Companies</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize: 13, color: '#5f6f88' }}>{filtered.length} shown</span>
          </div>
          <div style={styles.tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['#', 'Name', 'Designation', 'Company', 'Location', 'First Interaction', 'Interaction Date'].map(x => <th key={x} style={styles.th}>{x}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? '#f8fafc' : 'white' }}>
                    <td style={styles.td}>{i + 1}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{r.name}</td>
                    <td style={styles.td}>{r.designation}</td>
                    <td style={styles.td}>{r.company}</td>
                    <td style={styles.td}>{r.location}</td>
                    <td style={styles.td}>{fmtDate(r.firstInteraction)}</td>
                    <td style={styles.td}>
                    {fmtDate(r.lastGreeting)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: '16px 18px', border: '1px solid #e3e9f3' }}>
      <div style={{ fontSize: 12, color: '#5f6f88' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const styles = {
  headerPurple: headerStyle,
  btnGhost: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, padding: 20 },
  card: { background: 'white', borderRadius: 12, padding: 18, border: '1px solid #e3e9f3' },
  cardTitle: { fontSize: 13, fontWeight: 600, color: '#22324d', marginBottom: 12 },
  chip: { fontSize: 12, padding: '5px 14px', borderRadius: 20, cursor: 'pointer', background: '#f1f5f9', border: '1px solid transparent' },
  chipActive: { background: '#f6ecd6', border: '1px solid #d8b26a', fontWeight: 600 },
  toolbar: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  search: { flex: 1, minWidth: 200, padding: '9px 14px', border: '1px solid #e3e9f3', borderRadius: 8, fontSize: 13 },
  select: { padding: '9px 12px', border: '1px solid #e3e9f3', borderRadius: 8, fontSize: 13 },
  tableWrap: { background: 'white', borderRadius: 12, border: '1px solid #e3e9f3', overflow: 'auto' },
  th: { textAlign: 'left', padding: '11px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8', background: '#f8fafc', borderBottom: '1px solid #e3e9f3' },
  td: { padding: '10px 12px', fontSize: 13, color: '#22324d', borderBottom: '1px solid #f1f5f9' }
};