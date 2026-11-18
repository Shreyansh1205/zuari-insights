import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { getSummary, getActivity, fmtWhen, MODULE_TITLES } from './api';
import LoginScreen from './components/LoginScreen';
import BusinessModule from './modules/BusinessModule';
import CustomerModule from './modules/CustomerModule';
import ClaimsModule from './modules/ClaimsModule';
import MeetsModule from './modules/MeetsModule';

const DataScene = lazy(() => import('./three/DataScene.jsx'));

/* Simple stroke icons (no extra dependency) */
const Icon = ({ d, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const ICONS = {
  business: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  customers: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  claims: ['M9 12l2 2 4-4', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10'],
  meets: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', 'M8 9h8', 'M8 13h5'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
};

const MODULES = [
  { id: 'business', title: 'Business Dashboard', desc: 'Premium, revenue, endorsements and FY comparison.', bg: 'linear-gradient(145deg, #2f7bff, #1f5fd6)' },
  { id: 'customers', title: 'Customer Master', desc: 'Customer list, contacts, state and city.', bg: 'linear-gradient(145deg, #19b9a6, #0f8f80)' },
  { id: 'claims', title: 'Claims Pending', desc: 'Monthly claim tracker, ageing, status and the remarks trail.', bg: 'linear-gradient(145deg, #f0d49a, #d8b26a)', tag: 'UPDATED', dark: true },
  { id: 'meets', title: 'Customer Meets', desc: 'Meetings, interactions and follow-ups.', bg: 'linear-gradient(145deg, #e9962f, #c9771a)' },
];

function tilt(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 8}deg) rotateY(${(x - 0.5) * 10}deg) translateY(-4px)`;
  el.style.setProperty('--mx', `${x * 100}%`);
  el.style.setProperty('--my', `${y * 100}%`);
}
function untilt(e) { e.currentTarget.style.transform = ''; }

const ACTION_TEXT = { upload: 'uploaded', remove: 'removed', clear: 'cleared all files of' };

export default function App() {
  const { user, checking, logout, isUploader } = useAuth();
  const [activeModule, setActiveModule] = useState(null);
  const [summary, setSummary] = useState({});
  const [activity, setActivity] = useState([]);
  const back = () => { setActiveModule(null); window.scrollTo(0, 0); };

  // refresh the cards each time the landing page is shown
  useEffect(() => {
    if (!user || activeModule) return;
    getSummary().then(setSummary).catch(() => {});
    getActivity(8).then(setActivity).catch(() => {});
  }, [user, activeModule]);

  useEffect(() => { if (!user) setActiveModule(null); }, [user]);

  if (checking) return <div className="zi-landing" style={{ display: 'grid', placeItems: 'center' }}><span className="zi-chip">Checking session…</span></div>;
  if (!user) return <LoginScreen />;

  if (activeModule === 'business') return <BusinessModule onBack={back} />;
  if (activeModule === 'customers') return <CustomerModule onBack={back} />;
  if (activeModule === 'claims') return <ClaimsModule onBack={back} />;
  if (activeModule === 'meets') return <MeetsModule onBack={back} />;

  return (
    <div className="zi-landing">
      <div className="zi-mesh" />
      <div className="zi-grid" />
      <div className="zi-wrap">
        <nav className="zi-nav zi-rise">
          <div className="zi-brand">
            <div className="zi-mark">Z</div>
            <div>
              <b>Zuari Insights</b>
              <span>Insurance intelligence platform</span>
            </div>
          </div>
          <div className="zi-user">
            <span className="zi-chip"><span className="zi-dot" />{user.name} · {isUploader ? 'UPLOADER' : 'ADMIN · VIEW ONLY'}</span>
            <button type="button" className="zi-logout" onClick={logout}><Icon d={ICONS.logout} size={15} /> Sign out</button>
          </div>
        </nav>

        <section className="zi-hero">
          <div className="zi-rise" style={{ animationDelay: '.05s' }}>
            <span className="zi-chip">EXCEL → DASHBOARD → REPORT</span>
            <h1>Turn every report into <em>clear decisions.</em></h1>
            <p>{isUploader
              ? 'Upload the business, customer, claims or meetings sheet. It is saved to the server and the admin sees the same dashboard straight away.'
              : 'Every dashboard shows the latest files the uploader has saved. Filter, explore and download them as a report.'}</p>
            <div className="zi-stats">
              <div><b>4</b><span>Dashboards</span></div>
              <div><b>PDF + Excel</b><span>Report export</span></div>
              <div><b>{Object.values(summary).reduce((n, m) => n + (m?.count || 0), 0)}</b><span>Files on the server</span></div>
            </div>
          </div>
          <div className="zi-scene">
            <Suspense fallback={null}>
              <DataScene variant="hero" />
            </Suspense>
          </div>
        </section>

        <div className="zi-section-title">SELECT A DASHBOARD</div>
        <div className="zi-modules">
          {MODULES.map((m, i) => (
            <button
              type="button"
              key={m.id}
              className="zi-card zi-rise"
              style={{ animationDelay: `${0.1 + i * 0.06}s` }}
              onClick={() => setActiveModule(m.id)}
              onMouseMove={tilt}
              onMouseLeave={untilt}
            >
              {m.tag && <span className="tag">{m.tag}</span>}
              <div className="ico" style={{ background: m.bg, color: m.dark ? '#081428' : '#fff' }}><Icon d={ICONS[m.id]} /></div>
              <h3>{m.title}</h3>
              <p>{m.desc}</p>
              <span className="zi-meta">
                {summary[m.id]?.count
                  ? <>{summary[m.id].count} file{summary[m.id].count > 1 ? 's' : ''} · {summary[m.id].lastUploadedBy} · {fmtWhen(summary[m.id].lastUploadedAt)}</>
                  : 'No data uploaded yet'}
              </span>
              <span className="go">{isUploader ? 'Open & upload' : 'Open dashboard'} <Icon d={ICONS.arrow} size={16} /></span>
            </button>
          ))}
        </div>

        {activity.length > 0 && (
          <>
            <div className="zi-section-title">RECENT UPLOADS</div>
            <ul className="zi-activity">
              {activity.map((a, i) => (
                <li key={i}>
                  <span className={`dot ${a.action}`} />
                  <span><b>{a.user}</b> {ACTION_TEXT[a.action] || a.action} {a.name ? <b>{a.name}</b> : null}{a.name ? ' in ' : ' '}{MODULE_TITLES[a.module] || a.module}
                    {a.replaced?.length ? <em> (replaced {a.replaced.join(', ')})</em> : null}</span>
                  <time>{fmtWhen(a.at)}</time>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="zi-foot"><Icon d={ICONS.lock} size={14} /> Signed-in access only. Uploaded files are stored securely on the Zuari Insights server.</p>
      </div>
    </div>
  );
}