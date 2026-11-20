import React, { Suspense, lazy } from 'react';
import StoreBar from './StoreBar';

const DataScene = lazy(() => import('../three/DataScene.jsx'));

/*
  Dark 3D header band shared by the dashboards (same look as Claims Pending).
  - actions:  uploader-only buttons (Replace file …), shown next to "← Dashboards"
  - exports:  right-hand buttons (PDF / Excel)
*/
export default function DashBand({ chip, title, subtitle, onBack, store, actions, exports, children }) {
  return (
    <div className="cl-band ds-band">
      <div className="scene"><Suspense fallback={null}><DataScene variant="band" /></Suspense></div>
      <div className="cl-band-inner">
        <div className="cl-band-main">
          <div className="ds-actions">
            <button className="btn btn-ghost ds-btn" onClick={onBack}>← Dashboards</button>
            {store?.canUpload && actions}
          </div>
          {chip && <span className="zi-chip">{chip}</span>}
          <h1 style={{ marginTop: 10 }}>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          {children}
          {store && <StoreBar store={store} dark />}
        </div>
        <div className="ds-exports">{exports}</div>
      </div>
    </div>
  );
}

/* KPI tile with icon, used under the band */
export function Kpi({ label, value, hint, color, icon }) {
  return (
    <div className="cl-kpi ds-kpi" style={{ '--c': color }}>
      {icon && <span className="ds-kpi-ico" style={{ color }} aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>}
      <small>{label}</small>
      <b>{value}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}

export const ICON = {
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  map: <><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" /><path d="M8 2v16M16 6v16" /></>,
  pin: <><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6l-10 7L2 6" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></>,
  check: <><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><path d="M22 4L12 14l-3-3" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></>,
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
};