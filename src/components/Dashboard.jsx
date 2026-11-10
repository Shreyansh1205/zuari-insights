import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Doughnut, Chart } from 'react-chartjs-2';
import { formatCurrency, formatNumber, formatPct } from '../utils/data';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { headerStyle } from '../theme';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);
ChartJS.defaults.font.family = "Manrope, Inter, system-ui, sans-serif";
ChartJS.defaults.color = '#5f6f88';

export default function Dashboard({ data = [], filesData = [], years = [], onReset, onRemoveFile, onAddMore, onBack }) {
  // Safety guard
  if (!data || data.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef2f9" }}>
        <p>No data to display. Please upload a file.</p>
      </div>
    );
  }

  const [filters, setFilters] = useState({
    year: 'all', department: 'all', policyType: 'all', insurer: 'all',
    group: 'all', vertical: 'all', month: 'all', endorsement: 'all'
  });
  const [tableSearch, setTableSearch] = useState('');
  const [tableSort, setTableSort] = useState({ key: 'revenue', dir: 'desc' });
  const [activeTab, setActiveTab] = useState('overview'); // overview | comparison | endorsements
  const [compareFromMonth, setCompareFromMonth] = useState(4); // April = 4
  const [compareToMonth, setCompareToMonth] = useState(8);   // August = 8
  const [usePeriodFilter, setUsePeriodFilter] = useState(true); // toggle period vs full year

  // Filter options
  const departments = useMemo(() => [...new Set(data.map(r => r.department))].filter(d => d !== 'Unknown').sort(), [data]);
  const policyTypes = useMemo(() => [...new Set(data.map(r => r.policyType))].filter(d => d !== 'Unknown').sort(), [data]);
  const insurers = useMemo(() => [...new Set(data.map(r => r.insurer))].filter(d => d !== 'Unknown').sort(), [data]);
  const groups = useMemo(() => [...new Set(data.map(r => r.groupNonGroup))].filter(d => d !== 'Unknown').sort(), [data]);
  const verticals = useMemo(() => [...new Set(data.map(r => r.policyVertical))].filter(d => d !== 'Unknown').sort(), [data]);
  const months = useMemo(() => {
    const map = {};
    data.forEach(r => { if (r.monthKey !== 'Unknown') map[r.monthKey] = r.monthSort; });
    return Object.keys(map).sort((a, b) => map[a].localeCompare(map[b]));
  }, [data]);

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (filters.year !== 'all' && r.fy !== filters.year) return false;
      if (filters.department !== 'all' && r.department !== filters.department) return false;
      if (filters.policyType !== 'all' && r.policyType !== filters.policyType) return false;
      if (filters.insurer !== 'all' && r.insurer !== filters.insurer) return false;
      if (filters.group !== 'all' && r.groupNonGroup !== filters.group) return false;
      if (filters.vertical !== 'all' && r.policyVertical !== filters.vertical) return false;
      if (filters.month !== 'all' && r.monthKey !== filters.month) return false;
      if (filters.endorsement === 'fresh' && r.isEndorsement) return false;
      if (filters.endorsement === 'endorsement' && !r.isEndorsement) return false;
      return true;
    });
  }, [data, filters]);

  // KPIs
  const totalPremium = filtered.reduce((s, r) => s + r.premium, 0);
  const totalRevenue = filtered.reduce((s, r) => s + r.revenue, 0);
  const totalPolicies = filtered.length;
  const avgRevenue = totalPolicies ? totalRevenue / totalPolicies : 0;
  const brokeragePct = totalPremium ? (totalRevenue / totalPremium) * 100 : 0;
  const endorsementCount = filtered.filter(r => r.isEndorsement).length;
  const endorsementPct = totalPolicies ? (endorsementCount / totalPolicies) * 100 : 0;
  const totalUnbilled = filtered.reduce((s, r) => s + r.unbilled, 0);

  // Top customer
  const topCustomer = useMemo(() => {
    const agg = {};
    filtered.forEach(r => { agg[r.custName] = (agg[r.custName] || 0) + r.revenue; });
    const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? { name: sorted[0][0], value: sorted[0][1] } : null;
  }, [filtered]);

  // Charts
  const deptData = useMemo(() => {
    const agg = {};
    filtered.forEach(r => {
      if (r.department === 'Unknown') return;
      if (!agg[r.department]) agg[r.department] = { p: 0, r: 0 };
      agg[r.department].p += r.premium; agg[r.department].r += r.revenue;
    });
    const sorted = Object.entries(agg).sort((a, b) => b[1].r - a[1].r);
    return {
      labels: sorted.map(x => x[0]),
      datasets: [
        { label: 'Premium', data: sorted.map(x => x[1].p), backgroundColor: '#2f7bff', borderRadius: 5 },
        { label: 'Revenue', data: sorted.map(x => x[1].r), backgroundColor: '#19b9a6', borderRadius: 5 }
      ]
    };
  }, [filtered]);

  const trendData = useMemo(() => {
    const agg = {};
    filtered.forEach(r => {
      if (r.monthKey === 'Unknown') return;
      if (!agg[r.monthKey]) agg[r.monthKey] = { p: 0, r: 0, sort: r.monthSort };
      agg[r.monthKey].p += r.premium; agg[r.monthKey].r += r.revenue;
    });
    const sorted = Object.entries(agg).sort((a, b) => a[1].sort.localeCompare(b[1].sort));
    // Only show months that have data
    return {
      labels: sorted.map(x => x[0]),
      datasets: [
        { type: 'bar', label: 'Premium', data: sorted.map(x => x[1].p), backgroundColor: 'rgba(47,123,255,0.8)', borderRadius: 5, yAxisID: 'y' },
        { type: 'line', label: 'Revenue', data: sorted.map(x => x[1].r), borderColor: '#19b9a6', backgroundColor: 'rgba(25,185,166,0.1)', borderWidth: 2.5, pointRadius: 3, tension: 0.35, fill: true, yAxisID: 'y1' }
      ]
    };
  }, [filtered]);

  const endorsementData = useMemo(() => {
    const fresh = filtered.filter(r => !r.isEndorsement);
    const endo = filtered.filter(r => r.isEndorsement);
    return {
      labels: ['Fresh Policies', 'Endorsements'],
      datasets: [{
        data: [fresh.reduce((s, r) => s + r.revenue, 0), endo.reduce((s, r) => s + r.revenue, 0)],
        backgroundColor: ['#2f7bff', '#e9962f'],
        borderWidth: 0
      }]
    };
  }, [filtered]);

  const endoByType = useMemo(() => {
    const agg = {};
    filtered.filter(r => r.isEndorsement).forEach(r => {
      agg[r.endorsementType] = (agg[r.endorsementType] || 0) + r.revenue;
    });
    const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(x => x[0]),
      datasets: [{ label: 'Revenue', data: sorted.map(x => x[1]), backgroundColor: '#e9962f', borderRadius: 5 }]
    };
  }, [filtered]);

  // Year comparison (when multiple years)
  // Extract calendar month (1-12) from busDate
  const getCalMonth = (r) => {
    if (!r.busDate) return null;
    let d;
    if (r.busDate instanceof Date) d = r.busDate;
    else if (typeof r.busDate === 'number') d = new Date(Math.round((r.busDate - 25569) * 86400 * 1000));
    else d = new Date(r.busDate);
    if (isNaN(d.getTime())) return null;
    return d.getMonth() + 1; // 1-12
  };

  const monthInRange = (m, fromM, toM) => {
    if (m == null) return false;
    // Handle range that doesn't cross calendar year boundary in Indian FY
    // FY months: 4,5,6,7,8,9,10,11,12,1,2,3
    const fyOrder = [4,5,6,7,8,9,10,11,12,1,2,3];
    const fromIdx = fyOrder.indexOf(fromM);
    const toIdx = fyOrder.indexOf(toM);
    const mIdx = fyOrder.indexOf(m);
    if (fromIdx === -1 || toIdx === -1 || mIdx === -1) return false;
    return mIdx >= fromIdx && mIdx <= toIdx;
  };

  const yearComparison = useMemo(() => {
    if (years.length < 2) return null;
    const byYear = {};
    years.forEach(y => {
      const rows = data.filter(r => {
        if (r.fy !== y) return false;
        if (!usePeriodFilter) return true; // full year
        const m = getCalMonth(r);
        return monthInRange(m, compareFromMonth, compareToMonth);
      });
      byYear[y] = {
        premium: rows.reduce((s, r) => s + r.premium, 0),
        revenue: rows.reduce((s, r) => s + r.revenue, 0),
        policies: rows.length,
        endorsements: rows.filter(r => r.isEndorsement).length
      };
    });
    return byYear;
  }, [data, years, compareFromMonth, compareToMonth, usePeriodFilter]);

  const MONTH_OPTIONS = [
    { v: 4, l: 'Apr' }, { v: 5, l: 'May' }, { v: 6, l: 'Jun' },
    { v: 7, l: 'Jul' }, { v: 8, l: 'Aug' }, { v: 9, l: 'Sep' },
    { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dec' },
    { v: 1, l: 'Jan' }, { v: 2, l: 'Feb' }, { v: 3, l: 'Mar' }
  ];

  // Table data
  const tableRows = useMemo(() => {
    const agg = {};
    filtered.forEach(r => {
      if (!agg[r.policyType]) agg[r.policyType] = { count: 0, p: 0, r: 0, endo: 0 };
      agg[r.policyType].count++;
      agg[r.policyType].p += r.premium;
      agg[r.policyType].r += r.revenue;
      if (r.isEndorsement) agg[r.policyType].endo++;
    });
    let rows = Object.entries(agg)
      .filter(([k]) => k !== 'Unknown')
      .map(([type, d]) => ({
        type, count: d.count, premium: d.p, revenue: d.r,
        endo: d.endo, pct: 0
      }));
    const totalR = rows.reduce((s, r) => s + r.revenue, 0);
    rows = rows.map(r => ({ ...r, pct: totalR ? (r.revenue / totalR) * 100 : 0 }));

    // Search
    if (tableSearch) {
      const q = tableSearch.toLowerCase();
      rows = rows.filter(r => r.type.toLowerCase().includes(q));
    }
    // Sort
    rows.sort((a, b) => {
      const mul = tableSort.dir === 'asc' ? 1 : -1;
      return (a[tableSort.key] - b[tableSort.key]) * mul;
    });
    return rows;
  }, [filtered, tableSearch, tableSort]);

  const exportTable = () => {
    const ws = XLSX.utils.json_to_sheet(tableRows.map(r => ({
      'Policy Type': r.type,
      'Policies': r.count,
      'Premium': r.premium,
      'Revenue': r.revenue,
      'Endorsements': r.endo,
      '% of Revenue': r.pct.toFixed(1)
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    XLSX.writeFile(wb, 'zuari-summary.xlsx');
  };

  const downloadPDF = async () => {
    const element = document.getElementById('dashboard-content');
    if (!element) return;
    try {
      const canvas = await html2canvas(element, {
        scale: 1.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#eef2f9'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save('zuari-dashboard.pdf');
    } catch (err) {
      console.error('PDF error:', err);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 12 } } },
      tooltip: { backgroundColor: '#0c1a33', padding: 12, cornerRadius: 8, callbacks: { label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } }
    },
    scales: { x: { grid: { display: false } }, y: { grid: { color: '#f1f5f9' } } }
  };

  const activeFilters = Object.values(filters).filter(v => v !== 'all').length;

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9' }}>
      {/* Header */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={s.logo}>Z</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Zuari Insights</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {filesData.length} file(s) · {formatNumber(data.length)} records
              {years.length > 0 && ` · FY: ${years.map(y => y).join(', ')}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {onBack && <button className="btn btn-ghost" onClick={onBack}>← Modules</button>}
          <button className="btn btn-ghost" onClick={downloadPDF}>⬇ Download PDF</button>
          <button className="btn btn-ghost" onClick={onAddMore}>+ Add File</button>
          <button className="btn btn-ghost" onClick={onReset}>Upload New</button>
        </div>
      </header>

      <div id="dashboard-content">

      {/* File chips */}
      {filesData.length > 0 && (
        <div style={s.fileBar}>
          {filesData.map(f => (
            <span key={f.fileName} style={s.fileChip}>
              📄 {f.fileName}
              <button style={s.fileRemove} onClick={() => onRemoveFile(f.fileName)}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={s.tabs}>
        {['overview', 'comparison', 'endorsements'].map(t => (
          <button key={t} style={{ ...s.tab, ...(activeTab === t ? s.tabActive : {}) }} onClick={() => setActiveTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'comparison' ? 'Year Comparison' : 'Endorsements'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={s.filterBar}>
        <div style={s.filterInner}>
          {[
            { key: 'year', label: 'Year', options: years },
            { key: 'month', label: 'Month', options: months },
            { key: 'department', label: 'Department', options: departments },
            { key: 'policyType', label: 'Policy Type', options: policyTypes },
            { key: 'insurer', label: 'Insurer', options: insurers },
            { key: 'group', label: 'Group / Non Group', options: groups },
            { key: 'vertical', label: 'Policy Vertical', options: verticals },
            { key: 'endorsement', label: 'Type', options: ['fresh', 'endorsement'], labels: { fresh: 'Fresh Only', endorsement: 'Endorsements Only' } }
          ].map(f => (
            <div key={f.key} style={s.filterItem}>
              <label style={s.filterLabel}>{f.label}</label>
              <select value={filters[f.key]} onChange={e => setFilters(prev => ({ ...prev, [f.key]: e.target.value }))} style={s.select}>
                <option value="all">All</option>
                {f.options.map(o => <option key={o} value={o}>{f.labels?.[o] || o}</option>)}
              </select>
            </div>
          ))}
          {activeFilters > 0 && (
            <button style={s.clearBtn} onClick={() => setFilters({ year: 'all', department: 'all', policyType: 'all', insurer: 'all', group: 'all', vertical: 'all', month: 'all', endorsement: 'all' })}>
              Clear ({activeFilters})
            </button>
          )}
        </div>
      </div>

      {/* ===== OVERVIEW TAB ===== */}
      {activeTab === 'overview' && (
        <>
          <section style={s.kpiRow}>
            <KpiCard color="#2f7bff" bg="#e8f0ff" label="Total Premium (PBST)" value={formatCurrency(totalPremium)} />
            <KpiCard color="#19b9a6" bg="#e2f7f3" label="Total Revenue" value={formatCurrency(totalRevenue)} />
            <KpiCard color="#d8b26a" bg="#f6ecd6" label="Total Policies" value={formatNumber(totalPolicies)} />
            <KpiCard color="#e9962f" bg="#fffbeb" label="Avg Revenue / Policy" value={formatCurrency(avgRevenue)} />
            <KpiCard color="#5bc8f5" bg="#e2f7f3" label="Brokerage %" value={formatPct(brokeragePct)} />
            <KpiCard color="#e5566d" bg="#fef2f2" label="Endorsement %" value={formatPct(endorsementPct)} />
            {topCustomer && <KpiCard color="#7b8cff" bg="#e8f0ff" label="Top Customer" value={topCustomer.name.slice(0, 18) + (topCustomer.name.length > 18 ? '…' : '')} sub={formatCurrency(topCustomer.value)} />}
            {totalUnbilled !== 0 && <KpiCard color="#e9962f" bg="#fff7ed" label="Unbilled" value={formatCurrency(totalUnbilled)} />}
          </section>

          <section style={s.grid2}>
            <ChartCard title="Premium & Revenue by Department">
              <Bar data={deptData} options={chartOpts} />
            </ChartCard>
            <ChartCard title="Fresh vs Endorsements (Revenue)">
              <Doughnut data={endorsementData} options={{ ...chartOpts, plugins: { ...chartOpts.plugins, legend: { position: 'bottom' } } }} />
            </ChartCard>
          </section>

          <section style={{ padding: '0 28px 20px' }}>
            <ChartCard title="Monthly Trend – Premium vs Revenue" height={300}>
              <Chart type="bar" data={trendData} options={{
                ...chartOpts,
                scales: {
                  x: { grid: { display: false } },
                  y: { position: 'left', title: { display: true, text: 'Premium', font: { size: 11 } }, grid: { color: '#f1f5f9' } },
                  y1: { position: 'right', title: { display: true, text: 'Revenue', font: { size: 11 } }, grid: { drawOnChartArea: false } }
                }
              }} />
            </ChartCard>
          </section>
        </>
      )}

      {/* ===== YEAR COMPARISON TAB ===== */}
      {activeTab === 'comparison' && (
        <section style={{ padding: '24px 28px' }}>
          {years.length < 2 ? (
            <div style={s.emptyState}>
              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Upload files from different financial years</p>
              <p style={{ color: '#5f6f88', marginBottom: 16 }}>Add another FY's Business Report to enable year-over-year comparison.</p>
              <button className="btn btn-primary" onClick={onAddMore}>+ Add Another File</button>
            </div>
          ) : (
            <>
              {/* Period selector */}
              <div style={{
                background: 'white', borderRadius: 12, padding: '16px 20px', marginBottom: 20,
                border: '1px solid #e3e9f3', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap'
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#22324d' }}>Compare mode:</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setUsePeriodFilter(true)} style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: usePeriodFilter ? '1px solid #2f7bff' : '1px solid #e3e9f3',
                    background: usePeriodFilter ? '#e8f0ff' : 'white',
                    color: usePeriodFilter ? '#2f7bff' : '#5f6f88'
                  }}>Period (same months)</button>
                  <button onClick={() => setUsePeriodFilter(false)} style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: !usePeriodFilter ? '1px solid #2f7bff' : '1px solid #e3e9f3',
                    background: !usePeriodFilter ? '#e8f0ff' : 'white',
                    color: !usePeriodFilter ? '#2f7bff' : '#5f6f88'
                  }}>Full Year</button>
                </div>
                {usePeriodFilter && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 12, color: '#5f6f88' }}>From</label>
                      <select value={compareFromMonth} onChange={e => setCompareFromMonth(Number(e.target.value))}
                        style={{ padding: '7px 10px', border: '1px solid #e3e9f3', borderRadius: 8, fontSize: 13 }}>
                        {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 12, color: '#5f6f88' }}>To</label>
                      <select value={compareToMonth} onChange={e => setCompareToMonth(Number(e.target.value))}
                        style={{ padding: '7px 10px', border: '1px solid #e3e9f3', borderRadius: 8, fontSize: 13 }}>
                        {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                      </select>
                    </div>
                    <span style={{ fontSize: 12, color: '#2f7bff', fontWeight: 600, background: '#e8f0ff', padding: '5px 12px', borderRadius: 20 }}>
                      {MONTH_OPTIONS.find(m => m.v === compareFromMonth)?.l} – {MONTH_OPTIONS.find(m => m.v === compareToMonth)?.l}
                    </span>
                  </>
                )}
                {!usePeriodFilter && (
                  <span style={{ fontSize: 12, color: '#5f6f88', fontWeight: 500, background: '#f1f5f9', padding: '5px 12px', borderRadius: 20 }}>
                    Full financial year data
                  </span>
                )}
              </div>

              <div style={s.kpiRow}>
                {years.map(y => (
                  <div key={y} style={s.yearCard}>
                    <div style={{ fontSize: 13, color: '#5f6f88', fontWeight: 600 }}>
                      FY {y}{usePeriodFilter ? ` · ${MONTH_OPTIONS.find(m => m.v === compareFromMonth)?.l}–${MONTH_OPTIONS.find(m => m.v === compareToMonth)?.l}` : ' · Full Year'}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{formatCurrency(yearComparison[y]?.revenue || 0)}</div>
                    <div style={{ fontSize: 12, color: '#5f6f88', marginTop: 4 }}>
                      Premium: {formatCurrency(yearComparison[y]?.premium || 0)} · {formatNumber(yearComparison[y]?.policies || 0)} policies
                    </div>
                    <div style={{ fontSize: 12, color: '#e9962f', marginTop: 2 }}>
                      {yearComparison[y]?.endorsements || 0} endorsements
                    </div>
                  </div>
                ))}
              </div>

              {/* Growth indicators */}
              {years.length === 2 && yearComparison && (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12, marginBottom: 20
                }}>
                  {(() => {
                    const [y1, y2] = years;
                    const rev1 = yearComparison[y1]?.revenue || 0;
                    const rev2 = yearComparison[y2]?.revenue || 0;
                    const prem1 = yearComparison[y1]?.premium || 0;
                    const prem2 = yearComparison[y2]?.premium || 0;
                    const pol1 = yearComparison[y1]?.policies || 0;
                    const pol2 = yearComparison[y2]?.policies || 0;
                    const pct = (a, b) => b ? ((a - b) / Math.abs(b) * 100) : 0;
                    const items = [
                      { label: 'Revenue Growth', val: pct(rev2, rev1) },
                      { label: 'Premium Growth', val: pct(prem2, prem1) },
                      { label: 'Policy Growth', val: pct(pol2, pol1) }
                    ];
                    return items.map(it => (
                      <div key={it.label} style={{
                        background: 'white', borderRadius: 10, padding: 14, border: '1px solid #e3e9f3', textAlign: 'center'
                      }}>
                        <div style={{ fontSize: 12, color: '#5f6f88' }}>{it.label}</div>
                        <div style={{
                          fontSize: 20, fontWeight: 700, marginTop: 4,
                          color: it.val >= 0 ? '#159a8a' : '#c93b52'
                        }}>
                          {it.val >= 0 ? '+' : ''}{it.val.toFixed(1)}%
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              <ChartCard title={usePeriodFilter ? `FY Comparison – ${MONTH_OPTIONS.find(m => m.v === compareFromMonth)?.l} to ${MONTH_OPTIONS.find(m => m.v === compareToMonth)?.l}` : 'FY Comparison – Full Year'}>
                <Bar data={{
                  labels: years.map(y => `FY ${y}`),
                  datasets: [
                    { label: 'Premium', data: years.map(y => yearComparison[y]?.premium || 0), backgroundColor: '#2f7bff', borderRadius: 6 },
                    { label: 'Revenue', data: years.map(y => yearComparison[y]?.revenue || 0), backgroundColor: '#19b9a6', borderRadius: 6 }
                  ]
                }} options={chartOpts} />
              </ChartCard>
            </>
          )}
        </section>
      )}

      {/* ===== ENDORSEMENTS TAB ===== */}
      {activeTab === 'endorsements' && (
        <section style={{ padding: '24px 28px' }}>
          <div style={s.kpiRow}>
            <KpiCard color="#2f7bff" bg="#e8f0ff" label="Fresh Policies" value={formatNumber(totalPolicies - endorsementCount)} />
            <KpiCard color="#e9962f" bg="#fffbeb" label="Endorsements" value={formatNumber(endorsementCount)} />
            <KpiCard color="#e5566d" bg="#fef2f2" label="Endorsement %" value={formatPct(endorsementPct)} />
            <KpiCard color="#19b9a6" bg="#e2f7f3" label="Endorsement Revenue" value={formatCurrency(filtered.filter(r => r.isEndorsement).reduce((s, r) => s + r.revenue, 0))} />
          </div>
          <div style={s.grid2}>
            <ChartCard title="Revenue: Fresh vs Endorsements">
              <Doughnut data={endorsementData} options={{ ...chartOpts, plugins: { ...chartOpts.plugins, legend: { position: 'bottom' } } }} />
            </ChartCard>
            <ChartCard title="Endorsement Types (E1, E2, E3…)">
              <Bar data={endoByType} options={chartOpts} />
            </ChartCard>
          </div>
        </section>
      )}

      {/* Table (always visible) */}
      <section style={{ padding: '0 28px 48px' }}>
        <div style={s.tableCard}>
          <div style={s.tableHeader}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Summary by Policy Type</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search policy type…"
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                style={s.searchInput}
              />
              <button style={s.exportBtn} onClick={exportTable}>⬇ Export Excel</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    { key: 'type', label: 'Policy Type' },
                    { key: 'count', label: 'Policies' },
                    { key: 'premium', label: 'Premium' },
                    { key: 'revenue', label: 'Revenue' },
                    { key: 'endo', label: 'Endorsements' },
                    { key: 'pct', label: '% of Revenue' }
                  ].map(h => (
                    <th key={h.key} style={s.th} onClick={() => setTableSort(prev => ({
                      key: h.key, dir: prev.key === h.key && prev.dir === 'desc' ? 'asc' : 'desc'
                    }))}>
                      {h.label} {tableSort.key === h.key ? (tableSort.dir === 'desc' ? '↓' : '↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <tr key={row.type} style={{ background: i % 2 ? '#f8fafc' : 'white' }}>
                    <td style={s.td}>{row.type}</td>
                    <td style={s.td}>{formatNumber(row.count)}</td>
                    <td style={s.td}>{formatCurrency(row.premium)}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{formatCurrency(row.revenue)}</td>
                    <td style={s.td}>{row.endo}</td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: '#e3e9f3', borderRadius: 2, maxWidth: 50 }}>
                          <div style={{ width: `${Math.min(row.pct, 100)}%`, height: '100%', background: '#19b9a6', borderRadius: 2 }} />
                        </div>
                        {row.pct.toFixed(1)}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      </div>{/* end dashboard-content */}
    </div>
  );
}

function KpiCard({ color, bg, label, value, sub }) {
  return (
    <div style={s.kpiCard}>
      <div style={{ ...s.kpiIcon, background: bg, color }}>{label[0]}</div>
      <div>
        <div style={s.kpiLabel}>{label}</div>
        <div style={s.kpiValue}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: '#5f6f88' }}>{sub}</div>}
      </div>
    </div>
  );
}

function ChartCard({ title, children, height = 260 }) {
  return (
    <div style={s.chartCard}>
      <h3 style={s.chartTitle}>{title}</h3>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

const s = {
  header: headerStyle,
  logo: { width: 38, height: 38, background: 'linear-gradient(145deg, #f3dca8, #d8b26a)', color: '#081428', fontFamily: 'Fraunces, Georgia, serif', boxShadow: '0 8px 18px -8px rgba(216,178,106,.9)', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 },
  fileBar: { background: '#f8fafc', padding: '8px 28px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #e3e9f3' },
  fileChip: { fontSize: 12, background: 'white', border: '1px solid #e3e9f3', borderRadius: 20, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 },
  fileRemove: { background: 'none', border: 'none', color: '#e5566d', cursor: 'pointer', fontSize: 14 },
  tabs: { display: 'flex', gap: 0, background: 'white', borderBottom: '1px solid #e3e9f3', padding: '0 28px' },
  tab: { padding: '12px 20px', border: 'none', background: 'none', fontSize: 14, fontWeight: 500, color: '#5f6f88', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { color: '#2f7bff', borderBottomColor: '#2f7bff', fontWeight: 600 },
  filterBar: { background: 'white', borderBottom: '1px solid #e3e9f3', padding: '12px 28px', position: 'sticky', top: 60, zIndex: 40 },
  filterInner: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' },
  filterItem: { display: 'flex', flexDirection: 'column', gap: 3 },
  filterLabel: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8' },
  select: { padding: '7px 10px', border: '1px solid #e3e9f3', borderRadius: 8, minWidth: 120, fontSize: 12, background: '#f8fafc', outline: 'none' },
  clearBtn: { padding: '7px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#c93b52', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, padding: '20px 28px 8px' },
  kpiCard: { background: 'white', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' },
  kpiIcon: { width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 },
  kpiLabel: { fontSize: 11, color: '#5f6f88', fontWeight: 500 },
  kpiValue: { fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 1 },
  yearCard: { background: 'white', borderRadius: 12, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  grid2: { display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, padding: '14px 28px' },
  chartCard: { background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' },
  chartTitle: { fontSize: 13, fontWeight: 600, color: '#22324d', marginBottom: 12 },
  tableCard: { background: 'white', borderRadius: 12, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' },
  tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 10 },
  searchInput: { padding: '7px 12px', border: '1px solid #e3e9f3', borderRadius: 8, fontSize: 13, minWidth: 180, outline: 'none' },
  exportBtn: { padding: '7px 14px', borderRadius: 8, border: '1px solid #2f7bff', background: '#e8f0ff', color: '#2f7bff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  th: { textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#94a3b8', background: '#f8fafc', cursor: 'pointer', userSelect: 'none' },
  td: { padding: '11px 16px', fontSize: 13, color: '#22324d', borderBottom: '1px solid #f8fafc' },
  emptyState: { textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: 12, border: '1px solid #f1f5f9' }
};