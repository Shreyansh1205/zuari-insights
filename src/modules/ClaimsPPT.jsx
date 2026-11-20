import React, { useMemo, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, BarController, LineController } from 'chart.js';
import { fmtINR, fmtFull, fmtDate } from './claimsData';
import { PPT_BUCKETS } from './claimsReport';
import { Z } from '../theme';

/*
  Management summary built from the workbook's "PPT" sheet (+ new claim / settled /
  closed / Effect / new format sheets). Shown at the top of the Claims dashboard.
*/

ChartJS.register(BarController, LineController); // mixed bar + line chart

const BUCKET_COLORS = { '0-3': '#19b9a6', '3-6': '#2f7bff', '6-9': '#e9962f', '9-12': '#d96a2b', '12+': '#e5566d' };
const PARTY = {
  Insurer: { c: Z.rose, soft: Z.roseSoft, fg: '#a3283f', note: 'Awaiting insurer decision / payment' },
  Surveyor: { c: Z.azure, soft: Z.azureSoft, fg: '#1f4fb8', note: 'Survey / assessment report pending' },
  Insured: { c: Z.amber, soft: Z.amberSoft, fg: '#9a5d12', note: 'Documents / action pending with client' },
};
/* hex colour → rgba with alpha (heat-map shading; plain rgba so the PDF capture can read it) */
const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`; };
const k = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const cnt = (n) => (Number(n) || 0).toLocaleString('en-IN');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const opts = (extra = {}) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } }, tooltip: { padding: 10, cornerRadius: 10 } },
  ...extra,
});
const money = { ticks: { callback: (v) => fmtINR(v).replace('₹ ', '₹') }, grid: { color: '#eef2f8' } };

function Ico({ d, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
}
const I = {
  open: <><path d="M3 7h18v13H3z" /><path d="M3 7l3-4h12l3 4" /></>,
  plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  rev: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></>,
  x: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  slide: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
};

export default function ClaimsPPT({ report, insureds = [], onCompany, registerCount }) {
  const { ppt, lists, effect, trend } = report;
  const ageing = ppt?.ageing;
  const mis = ppt?.mis;
  const [metric, setMetric] = useState('amount'); // ageing matrix: amount | claims

  // match a PPT company name to an insured in the register (names differ in spacing / hyphens)
  const matchInsured = (name) => insureds.find((x) => k(x) === k(name)) || insureds.find((x) => k(x).includes(k(name)) || k(name).includes(k(x)));
  const clickCompany = (name) => { const m = matchInsured(name); if (m && onCompany) onCompany(m); };

  const maxCell = useMemo(() => {
    if (!ageing) return 1;
    return Math.max(1, ...ageing.rows.flatMap((r) => PPT_BUCKETS.map((b) => r.buckets[b][metric])));
  }, [ageing, metric]);

  const cur = mis?.current;
  const opening = mis?.opening;
  const closing = cur ? { count: cur.pendingCount, amount: cur.pendingAmount } : ageing ? { count: ageing.total.claims, amount: ageing.total.amount } : null;
  const flow = cur ? [
    { t: opening ? opening.label.replace(/^upto/i, 'Opening ·') : 'Opening', c: opening?.pendingCount, a: opening?.pendingAmount, ico: I.open, tone: 'ink' },
    { t: 'New claims', c: cur.newCount, a: cur.newAmount, ico: I.plus, tone: 'teal', sign: '+' },
    { t: 'Settled', c: cur.settledCount, a: cur.settledAmount, ico: I.check, tone: 'azure', sign: '−' },
    { t: 'Revision effect', c: null, a: cur.revision, ico: I.rev, tone: 'gold', sign: '±' },
    { t: 'Repudiated / closed', c: cur.closedCount, a: cur.closedAmount, ico: I.x, tone: 'rose', sign: '−' },
    { t: `Closing pending · ${cur.label}`, c: closing.count, a: closing.amount, ico: I.flag, tone: 'final' },
  ] : null;

  const mismatch = ageing && cur && ageing.total.claims !== cur.pendingCount;
  const regMismatch = registerCount != null && closing && registerCount !== closing.count;

  const stackChart = ageing && {
    labels: ageing.rows.map((r) => r.name),
    datasets: PPT_BUCKETS.map((b) => ({ label: `${b} mo`, data: ageing.rows.map((r) => r.buckets[b].amount), backgroundColor: BUCKET_COLORS[b], borderRadius: 4, stack: 'a' })),
  };
  const bucketDonut = ageing && {
    labels: PPT_BUCKETS.map((b) => `${b} months`),
    datasets: [{ data: PPT_BUCKETS.map((b) => ageing.total.buckets[b].amount), backgroundColor: PPT_BUCKETS.map((b) => BUCKET_COLORS[b]), borderWidth: 0, hoverOffset: 8 }],
  };
  const trendChart = trend && {
    labels: trend.map((t) => t.label),
    datasets: [
      { type: 'line', label: 'Closing pending (claims)', data: trend.map((t) => t.closing.count), borderColor: Z.ink700, backgroundColor: 'rgba(18,48,92,.08)', fill: true, tension: 0.35, pointRadius: 4, yAxisID: 'y' },
      { type: 'bar', label: 'Received', data: trend.map((t) => t.received.count), backgroundColor: Z.teal, borderRadius: 6, yAxisID: 'y' },
      { type: 'bar', label: 'Settled', data: trend.map((t) => t.settled.count), backgroundColor: Z.azure, borderRadius: 6, yAxisID: 'y' },
      { type: 'bar', label: 'Withdrawn', data: trend.map((t) => t.withdrawn.count), backgroundColor: Z.rose, borderRadius: 6, yAxisID: 'y' },
    ],
  };
  const trendAmt = trend && {
    labels: trend.map((t) => t.label),
    datasets: [{ label: 'Closing amount', data: trend.map((t) => t.closing.amount), borderColor: Z.gold, backgroundColor: 'rgba(216,178,106,.16)', fill: true, tension: 0.35, pointRadius: 4 }],
  };
  const last = trend?.[trend.length - 1];

  const pendTotal = ['Insurer', 'Surveyor', 'Insured'].reduce((a, p) => a + (ppt?.pendingAt?.[p]?.total.claims || 0), 0);

  return (
    <section id="cl-ppt-capture" className="pp">
      <header className="pp-head">
        <div>
          <span className="pp-eyebrow"><Ico d={I.slide} size={14} /> MANAGEMENT SUMMARY · PPT</span>
          <h2>Claim MIS — {report.label}</h2>
          <p>From the <b>PPT</b>, new / settled / closed and monthly movement sheets of <b>{report.fileName}</b>{ppt?.unit === 'lacs' ? ' · sheet amounts in lacs, shown here in ₹' : ''}</p>
        </div>
        {(mismatch || regMismatch) && (
          <div className="pp-warn">
            <b>Check the sheet totals</b>
            {mismatch && <span>Ageing table totals {ageing.total.claims} claims, Claim MIS says {cur.pendingCount}.</span>}
            {regMismatch && <span>Claim-pending register has {registerCount} claims, PPT says {closing.count}.</span>}
          </div>
        )}
      </header>

      {/* ---- 1. Opening → closing flow ---- */}
      {flow && (
        <div className="pp-flow">
          {flow.map((s, i) => (
            <div key={s.t} className={`pp-step ${s.tone}`}>
              <span className="pp-step-ico"><Ico d={s.ico} /></span>
              <small>{s.t}</small>
              <b>{s.sign && s.sign !== '±' && (s.c || s.a) ? s.sign : ''}{s.c == null ? '' : cnt(s.c)}{s.c == null ? fmtINR(s.a) : ''}</b>
              <span>{s.c == null ? (s.a ? 'net change in claimed amount' : 'no revision') : fmtINR(s.a)}</span>
              {i < flow.length - 1 && <i className="pp-arrow" aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}

      {/* ---- 2. Ageing Claim MIS ---- */}
      {ageing && (
        <div className="pp-card">
          <div className="pp-card-hd">
            <div><h3>Ageing Claim MIS</h3><div className="sub">Pending claims by company and months pending · {ageing.settledLabel}</div></div>
            <div className="pp-seg" role="group" aria-label="Show">
              <button className={metric === 'amount' ? 'on' : ''} onClick={() => setMetric('amount')}>Amount</button>
              <button className={metric === 'claims' ? 'on' : ''} onClick={() => setMetric('claims')}>Claims</button>
            </div>
          </div>
          <div className="pp-table-wrap">
            <table className="pp-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="l">Company</th>
                  <th rowSpan={2} className="settled">Settled<br /><small>{ageing.settledMonth ? report.label : 'this month'}</small></th>
                  {PPT_BUCKETS.map((b) => <th key={b} className="bk"><i style={{ background: BUCKET_COLORS[b] }} />{b === '12+' ? '12 & above' : `${b} months`}</th>)}
                  <th rowSpan={2} className="tot">Total pending</th>
                </tr>
              </thead>
              <tbody>
                {ageing.rows.map((r) => (
                  <tr key={r.name} className={matchInsured(r.name) ? 'link' : ''} onClick={() => clickCompany(r.name)} title={matchInsured(r.name) ? 'Show these claims in the register' : ''}>
                    <td className="l"><b>{r.name}</b></td>
                    <td className="settled">{r.settled.claims ? <>{cnt(r.settled.claims)}<small>{fmtINR(r.settled.amount)}</small></> : <span className="nil">–</span>}</td>
                    {PPT_BUCKETS.map((b) => {
                      const v = r.buckets[b];
                      const heat = v[metric] / maxCell;
                      return (
                        <td key={b} className="cell" style={{ background: tint(BUCKET_COLORS[b], heat * 0.24) }}>
                          {v.claims ? <><b>{metric === 'amount' ? fmtINR(v.amount) : cnt(v.claims)}</b><small>{metric === 'amount' ? `${cnt(v.claims)} claim${v.claims > 1 ? 's' : ''}` : fmtINR(v.amount)}</small></> : <span className="nil">–</span>}
                        </td>
                      );
                    })}
                    <td className="tot"><b>{cnt(r.claims)}</b><small>{fmtINR(r.amount)}</small></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="l">Grand total</td>
                  <td className="settled">{cnt(ageing.total.settled.claims)}<small>{fmtINR(ageing.total.settled.amount)}</small></td>
                  {PPT_BUCKETS.map((b) => <td key={b}>{cnt(ageing.total.buckets[b].claims)}<small>{fmtINR(ageing.total.buckets[b].amount)}</small></td>)}
                  <td className="tot">{cnt(ageing.total.claims)}<small>{fmtINR(ageing.total.amount)}</small></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="pp-grid g21" style={{ marginTop: 16 }}>
            <div className="pp-sub-card">
              <h4>Amount by company and age</h4>
              <div className="pp-chart"><Bar data={stackChart} options={opts({ indexAxis: 'y', scales: { x: { ...money, stacked: true }, y: { stacked: true, grid: { display: false } } }, onClick: (_, els) => els[0] && clickCompany(ageing.rows[els[0].index].name) })} /></div>
            </div>
            <div className="pp-sub-card">
              <h4>Share of amount by age</h4>
              <div className="pp-chart"><Doughnut data={bucketDonut} options={opts({ cutout: '66%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 10 } }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtINR(c.raw)} (${pct(c.raw, ageing.total.amount)}%)` } } } })} /></div>
            </div>
          </div>
        </div>
      )}

      {/* ---- 3. Pending at ---- */}
      {(ppt?.pendingAt?.Insurer || ppt?.pendingAt?.Surveyor || ppt?.pendingAt?.Insured) && (
        <>
          <div className="pp-title">Where claims are pending</div>
          <div className="pp-grid g3">
            {['Insurer', 'Surveyor', 'Insured'].map((p) => {
              const blk = ppt.pendingAt[p];
              const st = PARTY[p];
              if (!blk) return <div key={p} className="pp-card pp-party empty">No “Pending at {p}” table in this sheet.</div>;
              const max = Math.max(1, ...blk.rows.map((r) => r.amount));
              return (
                <div key={p} className="pp-card pp-party" style={{ '--c': st.c, '--soft': st.soft, '--fg': st.fg }}>
                  <div className="pp-party-hd">
                    <span className="tag">Pending at {p} end</span>
                    <span className="share">{pct(blk.total.claims, pendTotal)}% of claims</span>
                  </div>
                  <div className="pp-party-num"><b>{cnt(blk.total.claims)}</b><span>claims · {fmtINR(blk.total.amount)}</span></div>
                  <p className="note">{st.note}</p>
                  <ul>
                    {[...blk.rows].sort((a, b) => b.amount - a.amount).map((r) => (
                      <li key={r.name} className={matchInsured(r.name) ? 'link' : ''} onClick={() => clickCompany(r.name)}>
                        <div className="row"><span>{r.name}</span><b>{cnt(r.claims)} · {fmtINR(r.amount)}</b></div>
                        <div className="bar"><i style={{ width: `${(r.amount / max) * 100}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ---- 4. 12+ months vs 0-12 months ---- */}
      {(ppt?.above12 || ppt?.below12) && (
        <div className="pp-card">
          <div className="pp-card-hd"><div><h3>Long-pending split</h3><div className="sub">12 months & above vs 0–12 months</div></div></div>
          {ppt.above12 && ppt.below12 && (() => {
            const tot = ppt.above12.total.amount + ppt.below12.total.amount;
            return (
              <div className="pp-split">
                <div style={{ width: `${Math.max(4, pct(ppt.below12.total.amount, tot))}%` }} className="lo"><span>0–12 months · {pct(ppt.below12.total.amount, tot)}%</span></div>
                <div style={{ width: `${Math.max(4, pct(ppt.above12.total.amount, tot))}%` }} className="hi"><span>12+ · {pct(ppt.above12.total.amount, tot)}%</span></div>
              </div>
            );
          })()}
          <div className="pp-grid g2" style={{ marginTop: 14 }}>
            {[['12 months & above', ppt.above12, 'hi'], ['0–12 months', ppt.below12, 'lo']].map(([t, blk, tone]) => blk && (
              <div key={t} className={`pp-sub-card pp-age ${tone}`}>
                <div className="pp-age-hd"><h4>{t}</h4><b>{cnt(blk.total.claims)} claims · {fmtINR(blk.total.amount)}</b></div>
                <table className="pp-mini">
                  <tbody>
                    {blk.rows.map((r) => (
                      <tr key={r.name} className={matchInsured(r.name) ? 'link' : ''} onClick={() => clickCompany(r.name)}>
                        <td>{r.name}</td><td className="n">{cnt(r.claims)}</td><td className="n">{fmtINR(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- 5. Month-on-month movement (new format sheet) ---- */}
      {trend && trend.length > 0 && (
        <div className="pp-card">
          <div className="pp-card-hd">
            <div><h3>Monthly movement · {trend[0].label} – {last.label}</h3><div className="sub">Opening, received, settled, withdrawn and closing claims from the “new format” sheet</div></div>
            <div className="pp-ytd">
              <div><small>YTD received</small><b>{cnt(last.received.ytdCount)}</b><span>{fmtINR(last.received.ytdAmount)}</span></div>
              <div><small>YTD settled</small><b>{cnt(last.settled.ytdCount)}</b><span>{fmtINR(last.settled.ytdAmount)}</span></div>
              <div><small>YTD withdrawn</small><b>{cnt(last.withdrawn.ytdCount)}</b><span>{fmtINR(last.withdrawn.ytdAmount)}</span></div>
            </div>
          </div>
          <div className="pp-grid g2">
            <div className="pp-sub-card"><h4>Claims</h4><div className="pp-chart"><Bar data={trendChart} options={opts({ scales: { y: { beginAtZero: true, grid: { color: '#eef2f8' } }, x: { grid: { display: false } } } })} /></div></div>
            <div className="pp-sub-card"><h4>Closing amount pending</h4><div className="pp-chart"><Line data={trendAmt} options={opts({ plugins: { legend: { display: false } }, scales: { y: { ...money, beginAtZero: true }, x: { grid: { display: false } } } })} /></div></div>
          </div>
          <div className="pp-table-wrap" style={{ marginTop: 14 }}>
            <table className="pp-table pp-trend">
              <thead><tr><th className="l">Claims (count · amount)</th>{trend.map((t) => <th key={t.label}>{t.label}</th>)}</tr></thead>
              <tbody>
                {[['opening', 'Opening'], ['received', 'Claims received'], ['revision', 'Effect of revision'], ['settled', 'Claims settled'], ['withdrawn', 'Claims withdrawn'], ['closing', 'Closing']].map(([f, l]) => (
                  <tr key={f} className={f === 'closing' ? 'strong' : ''}>
                    <td className="l">{l}</td>
                    {trend.map((t) => <td key={t.label}>{f === 'revision' ? '' : cnt(t[f].count)}<small>{fmtINR(t[f].amount)}</small></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- 6. This month's new / settled / closed claims ---- */}
      {(lists.received || lists.settled || lists.closed) && (
        <>
          <div className="pp-title">Claims movement in {report.label}</div>
          <div className="pp-grid g3">
            {[['received', 'New claims', 'teal'], ['settled', 'Claims settled', 'azure'], ['closed', 'Claims closed / repudiated', 'rose']].map(([f, t, tone]) => {
              const L = lists[f];
              if (!L) return null;
              return (
                <div key={f} className={`pp-card pp-list ${tone}`}>
                  <div className="pp-list-hd">
                    <h3>{t}</h3>
                    <b>{L.items.length}</b>
                  </div>
                  <div className="sub">{L.items.length ? <>Claimed {fmtINR(L.totals.claimed)}{L.totals.settled ? <> · settled {fmtINR(L.totals.settled)}</> : null}</> : 'NIL this month'}</div>
                  {L.items.map((it, i) => {
                    const eff = f === 'settled' ? effect?.rows.find((e) => k(e.name) === k(it.insured) && Math.abs(e.claimed - it.claimed) < 1) : null;
                    return (
                      <div key={i} className="pp-claim">
                        <div className="hd"><b>{it.insured}</b><span>{fmtFull(it.claimed)}</span></div>
                        <div className="nat">{it.nature || '—'}</div>
                        <div className="meta">
                          {it.insurer && <span>{it.insurer}</span>}
                          {it.lossDate && <span>Loss {it.lossDate instanceof Date ? fmtDate(it.lossDate) : it.lossDate}</span>}
                          {it.settled > 0 && <span className="ok">Settled {fmtFull(it.settled)}</span>}
                          {eff && eff.diff > 0 && <span className="diff">Short by {fmtFull(eff.diff)} ({pct(eff.diff, eff.claimed)}%)</span>}
                        </div>
                        {it.status && <div className="st">{it.status.length > 160 ? `${it.status.slice(0, 159)}…` : it.status}</div>}
                      </div>
                    );
                  })}
                  {f === 'settled' && effect && (
                    <div className="pp-effect">Effect of settlement: claimed {fmtINR(effect.total.claimed)} → settled {fmtINR(effect.total.settled)} · difference <b>{fmtINR(effect.total.diff)}</b></div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}