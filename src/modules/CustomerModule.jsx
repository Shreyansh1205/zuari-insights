import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { UploadScreen } from './BusinessModule';
import { headerStyle } from '../theme';

function parseCustomerExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];

        // Try multiple header rows (title rows often sit above)
        let rows = [];
        let headerRow = 0;
        for (let r = 0; r <= 3; r++) {
          const candidate = XLSX.utils.sheet_to_json(sheet, { defval: '', range: r });
          if (!candidate.length) continue;
          const keys = Object.keys(candidate[0]).map(k => k.toLowerCase());
          if (keys.some(k => k.includes('customer') || k.includes('custname') || k.includes('custcode') || k === 'name')) {
            rows = candidate;
            headerRow = r;
            break;
          }
        }
        if (!rows.length) {
          rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        }

        if (!rows.length) return reject(new Error('No data rows found in file'));

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

        const nameCol = find(['Customer Name', 'CustName', 'Cust Name', 'Name']);
        const codeCol = find(['CustCode', 'Cust Code', 'Code', 'S.NO', 'SNO']);
        const stateCol = find(['State']);
        const cityCol = find(['City']);
        const mobileCol = find(['Mobile', 'Phone', 'PhoneNo']);
        const emailCol = find(['Email ID', 'Email', 'Email ID 2']);

        const data = rows.map((r, i) => ({
          id: i,
          name: String(r[nameCol] || '').trim(),
          code: String(r[codeCol] || '').trim(),
          state: String(r[stateCol] || '').trim() || 'Unknown',
          city: String(r[cityCol] || '').trim() || 'Unknown',
          mobile: String(r[mobileCol] || '').trim(),
          email: String(r[emailCol] || '').trim()
        })).filter(r => r.name && r.name.toLowerCase() !== 'customer name' && r.name.length > 1);

        if (!data.length) return reject(new Error('Could not find customer rows. Check column headers.'));
        resolve({ fileName: file.name, rows: data });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export default function CustomerModule({ onBack }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const inputRef = useRef(null);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => /\.xlsx?$/i.test(f.name));
    if (!files.length) { setError('Upload .xlsx or .xls file'); return; }
    setLoading(true); setError('');
    try {
      const parsed = await parseCustomerExcel(files[0]);
      setData(parsed.rows);
    } catch (err) { setError(err.message || 'Failed to parse file'); }
    finally { setLoading(false); }
  };

  const states = useMemo(() => [...new Set(data.map(r => r.state))].filter(s => s && s !== 'Unknown').sort(), [data]);
  const cities = useMemo(() => {
    let list = data;
    if (stateFilter !== 'all') list = list.filter(r => r.state === stateFilter);
    return [...new Set(list.map(r => r.city))].filter(c => c && c !== 'Unknown').sort();
  }, [data, stateFilter]);

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (stateFilter !== 'all' && r.state !== stateFilter) return false;
      if (cityFilter !== 'all' && r.city !== cityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.mobile.includes(q);
      }
      return true;
    });
  }, [data, search, stateFilter, cityFilter]);

  // Analytics
  const stateDist = useMemo(() => {
    const m = {};
    data.forEach(r => { m[r.state] = (m[r.state] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [data]);

  const withEmail = data.filter(r => r.email).length;
  const withMobile = data.filter(r => r.mobile && r.mobile !== '9999999999' && r.mobile.length >= 10).length;

  const downloadPDF = async () => {
    const el = document.getElementById('customer-content');
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { scale: 1.5, backgroundColor: '#eef2f9' });
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
      pdf.save('customer-master.pdf');
    } catch (e) { alert('PDF failed'); }
  };

  if (!data.length) {
    return (
      <UploadScreen
        title="Customer Master"
        desc="Upload Customer Data Excel to view customer list, contacts and locations."
        color="#2f7bff"
        loading={loading}
        error={error}
        dragOver={dragOver}
        setDragOver={setDragOver}
        onFiles={handleFiles}
        onBack={onBack}
        inputRef={inputRef}
        features={['Search & filters', 'State / City analytics', 'PDF Export']}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9' }}>
      <header style={styles.headerBlue}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={styles.btnGhost} onClick={onBack}>← Modules</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Customer Master</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{data.length} customers loaded</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.btnGhost} onClick={downloadPDF}>⬇ PDF</button>
          <button style={styles.btnGhost} onClick={() => setData([])}>Upload New</button>
        </div>
      </header>

      <div id="customer-content">
        {/* KPIs */}
        <div style={styles.kpiRow}>
          <Kpi label="Total Customers" value={data.length} color="#2f7bff" />
          <Kpi label="States" value={states.length} color="#2f7bff" />
          <Kpi label="With Email" value={withEmail} color="#d8b26a" />
          <Kpi label="With Valid Mobile" value={withMobile} color="#e9962f" />
        </div>

        {/* State distribution */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Customers by State (Top 8)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stateDist.map(([st, cnt]) => (
                <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 120, fontSize: 13, fontWeight: 500, color: '#22324d' }}>{st}</span>
                  <div style={{ flex: 1, height: 8, background: '#e3e9f3', borderRadius: 4 }}>
                    <div style={{ width: `${(cnt / data.length) * 100}%`, height: '100%', background: '#2f7bff', borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, width: 30 }}>{cnt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters + Table */}
        <div style={{ padding: '0 20px 32px' }}>
          <div style={styles.toolbar}>
            <input style={styles.search} placeholder="Search name, code, city, email, mobile…" value={search} onChange={e => setSearch(e.target.value)} />
            <select style={styles.select} value={stateFilter} onChange={e => { setStateFilter(e.target.value); setCityFilter('all'); }}>
              <option value="all">All States</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={styles.select} value={cityFilter} onChange={e => setCityFilter(e.target.value)}>
              <option value="all">All Cities</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize: 13, color: '#5f6f88' }}>{filtered.length} shown</span>
          </div>
          <div style={styles.tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['#', 'Customer Name', 'Code', 'State', 'City', 'Mobile', 'Email'].map(x => <th key={x} style={styles.th}>{x}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? '#f8fafc' : 'white' }}>
                    <td style={styles.td}>{i + 1}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{r.name}</td>
                    <td style={styles.td}>{r.code}</td>
                    <td style={styles.td}>{r.state}</td>
                    <td style={styles.td}>{r.city}</td>
                    <td style={styles.td}>{r.mobile}</td>
                    <td style={styles.td}>{r.email}</td>
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
    <div style={{ background: 'white', borderRadius: 12, padding: '16px 18px', border: '1px solid #e3e9f3', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 12, color: '#5f6f88', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const styles = {
  headerBlue: headerStyle,
  btnGhost: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, padding: 20 },
  card: { background: 'white', borderRadius: 12, padding: 18, border: '1px solid #e3e9f3' },
  cardTitle: { fontSize: 14, fontWeight: 600, color: '#22324d', marginBottom: 14 },
  toolbar: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  search: { flex: 1, minWidth: 200, padding: '9px 14px', border: '1px solid #e3e9f3', borderRadius: 8, fontSize: 13, outline: 'none' },
  select: { padding: '9px 12px', border: '1px solid #e3e9f3', borderRadius: 8, fontSize: 13, background: 'white' },
  tableWrap: { background: 'white', borderRadius: 12, border: '1px solid #e3e9f3', overflow: 'auto' },
  th: { textAlign: 'left', padding: '11px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8', background: '#f8fafc', borderBottom: '1px solid #e3e9f3' },
  td: { padding: '11px 14px', fontSize: 13, color: '#22324d', borderBottom: '1px solid #f1f5f9' }
};