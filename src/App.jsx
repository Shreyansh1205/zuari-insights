import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { getSummary, getActivity, fmtWhen, timeAgo, initials, MODULE_TITLES } from './api';
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
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14'],
};

const MODULES = [
  { id: 'business', title: 'Business Dashboard', desc: 'Premium, revenue, endorsements and FY comparison.', bg: 'linear-gradient(145deg, #2f7bff, #1f5fd6)' },
  { id: 'customers', title: 'Customer Master', desc: 'Customer list, contacts, state and city.', bg: 'linear-gradient(145deg, #19b9a6, #0f8f80)' },
  { id: 'claims', title: 'Claims Pending', desc: 'Monthly claim tracker, ageing, status and the remarks trail.', bg: 'linear-gradient(145deg, #f0d49a, #d8b26a)', dark: true },
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

const ACTION_TEXT = { upload: 'uploaded', remove: 'removed', clear: 'cleared' };
const ACTION_ICON = { upload: 'upload', remove: 'trash', clear: 'trash' };

export default function App() {
  const { user, checking, logout, isUploader } = useAuth();
  const [activeModule, setActiveModule] = useState(null);
  const [summary, setSummary] = useState({});
  const [activity, setActivity] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [menu, setMenu] = useState(false);
  const back = () => { setActiveModule(null); window.scrollTo(0, 0); };

  const refresh = () => Promise.all([
    getSummary().then(setSummary).catch(() => {}),
    getActivity(8).then(setActivity).catch(() => {}),
  ]).finally(() => setLoaded(true));

  // refresh the cards each time the landing page is shown
  useEffect(() => { if (user && !activeModule) refresh(); }, [user, activeModule]);
  useEffect(() => { if (!user) { setActiveModule(null); setLoaded(false); setMenu(false); } }, [user]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!e.target.closest?.('.zi-userbox')) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('click', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  if (checking) {
    return (
      <div className="zi-landing zi-boot">
        <div className="zi-mark">Z</div>
        <span className="zl-spin lg" />
      </div>
    );
  }
  if (!user) return <LoginScreen />;

  if (activeModule === 'business') return <BusinessModule onBack={back} />;
  if (activeModule === 'customers') return <CustomerModule onBack={back} />;
  if (activeModule === 'claims') return <ClaimsModule onBack={back} />;
  if (activeModule === 'meets') return <MeetsModule onBack={back} />;

  const files = Object.values(summary).reduce((n, m) => n + (m?.count || 0), 0);
  const live = MODULES.filter((m) => summary[m.id]?.count).length;
  const lastAt = Object.values(summary).map((m) => m?.lastUploadedAt).filter(Boolean).sort().pop();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = (user.name || '').split(' ')[0];

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
          <div className="zi-userbox">
            <button type="button" className="zi-userbtn" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
              <span className={`zi-avatar ${isUploader ? 'up' : 'ad'}`}>{initials(user.name)}</span>
              <span className="who"><b>{user.name}</b><small>{isUploader ? 'Uploader' : 'Admin · view only'}</small></span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {menu && (
              <div className="zi-menu" role="menu">
                <div className="zi-menu-head">Signed in as <b>{user.username}</b></div>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); refresh(); }}><Icon d={ICONS.refresh} size={15} /> Refresh data</button>
                <button type="button" role="menuitem" className="danger" onClick={logout}><Icon d={ICONS.logout} size={15} /> Sign out</button>
              </div>
            )}
          </div>
        </nav>

        <section className="zi-hero">
          <div className="zi-rise" style={{ animationDelay: '.05s' }}>
            <span className="zi-chip">{isUploader ? <><Icon d={ICONS.upload} size={13} /> UPLOAD CENTRE</> : <><Icon d={ICONS.eye} size={13} /> EXECUTIVE VIEW</>}</span>
            <h1>{greet}, <em>{first}.</em></h1>
            <p>{isUploader
              ? 'Upload the latest business, customer, claims or meetings sheet. Each file is published to management the moment it is saved.'
              : 'Every dashboard below reflects the latest files published by the uploader. Open one to filter, explore and export the report.'}</p>
            <div className="zi-stats">
              <div><b>{loaded ? `${live}/${MODULES.length}` : '–'}</b><span>Dashboards live</span></div>
              <div><b>{loaded ? files : '–'}</b><span>Files published</span></div>
              <div><b>{loaded ? (lastAt ? timeAgo(lastAt) : 'Never') : '–'}</b><span>Last update</span></div>
            </div>
          </div>
          <div className="zi-scene">
            <Suspense fallback={null}>
              <DataScene variant="hero" />
            </Suspense>
          </div>
        </section>

        <div className="zi-section-title">{isUploader ? 'CHOOSE WHERE TO UPLOAD' : 'DASHBOARDS'}</div>
        <div className="zi-modules">
          {MODULES.map((m, i) => {
            const sm = summary[m.id];
            const has = !!sm?.count;
            return (
              <button
                type="button"
                key={m.id}
                className={`zi-card zi-rise${has ? '' : ' empty'}`}
                style={{ animationDelay: `${0.1 + i * 0.06}s` }}
                onClick={() => setActiveModule(m.id)}
                onMouseMove={tilt}
                onMouseLeave={untilt}
              >
                <span className={`zi-status ${has ? 'on' : 'off'}`}>
                  {!loaded ? '…' : has ? <><i />LIVE</> : isUploader ? 'NEEDS UPLOAD' : 'AWAITING DATA'}
                </span>
                <div className="ico" style={{ background: m.bg, color: m.dark ? '#081428' : '#fff' }}><Icon d={ICONS[m.id]} /></div>
                <h3>{m.title}</h3>
                <p>{m.desc}</p>
                <div className="zi-card-meta">
                  {has ? (
                    <>
                      <span className="zi-avatar xs">{initials(sm.lastUploadedBy)}</span>
                      <span><b>{sm.count} file{sm.count > 1 ? 's' : ''}</b> · {timeAgo(sm.lastUploadedAt)}</span>
                    </>
                  ) : (
                    <span className="muted">{isUploader ? 'No file yet, upload to publish' : 'Nothing published yet'}</span>
                  )}
                </div>
                <span className="go">
                  {isUploader ? (has ? 'Open & update' : 'Upload file') : has ? 'Open dashboard' : 'View'}
                  <Icon d={ICONS.arrow} size={16} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="zi-section-title">RECENT ACTIVITY</div>
        {activity.length > 0 ? (
          <ul className="zi-activity zi-rise">
            {activity.map((a, i) => (
              <li key={i}>
                <span className={`zi-act-ico ${a.action}`}><Icon d={ICONS[ACTION_ICON[a.action] || 'upload']} size={15} /></span>
                <span className="zi-act-txt">
                  <span><b>{a.user}</b> {ACTION_TEXT[a.action] || a.action} {a.name ? <b className="file">{a.name}</b> : a.action === 'clear' ? 'all files' : null}</span>
                  <small>
                    <span className="zi-tag">{MODULE_TITLES[a.module] || a.module}</span>
                    {a.replaced?.length ? <>replaced {a.replaced.join(', ')}</> : null}
                  </small>
                </span>
                <time title={fmtWhen(a.at)}>{timeAgo(a.at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <div className="zi-activity empty">{loaded ? 'No uploads yet. Activity will appear here.' : 'Loading activity…'}</div>
        )}

        <p className="zi-foot"><Icon d={ICONS.lock} size={14} /> Role-based access · files stored on the secured Zuari Insights server</p>
      </div>
    </div>
  );
}