import React from 'react';
import { fmtWhen, timeAgo, initials } from '../api';

/*
  "Data source" strip shown on every dashboard: which files are live,
  who uploaded them and when, plus save progress and errors.
  dark = true when placed inside a dark header band (Claims).
*/
export default function StoreBar({ store, dark = false }) {
  const { stored, latest, saving, storeError, canUpload } = store;
  if (!stored.length && !saving && !storeError) return null;
  const pct = saving ? Number((saving.match(/(\d+)%/) || [])[1] || 0) : 0;

  return (
    <div className={`zi-source${dark ? ' dark' : ''}`}>
      <div className="zi-source-in">
        {latest && (
          <>
            <span className="zi-source-ico" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></svg>
            </span>
            <div className="zi-source-txt">
              <b><span className="live" />{stored.length} file{stored.length > 1 ? 's' : ''} live</b>
              <span title={stored.map((m) => m.name).join(', ')}>{stored.map((m) => m.name).join(' · ')}</span>
            </div>
            <span className="zi-source-sep" />
            <span className="zi-avatar" aria-hidden="true">{initials(latest.uploadedBy)}</span>
            <div className="zi-source-txt">
              <b>{latest.uploadedBy}</b>
              <span>Updated {timeAgo(latest.uploadedAt)} · {fmtWhen(latest.uploadedAt)}</span>
            </div>
          </>
        )}
        <span className="zi-source-grow" />
        {saving && (
          <div className="zi-source-save">
            <span>{saving.replace(/ · \d+%$/, '')}</span>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          </div>
        )}
        {storeError && <span className="zi-source-err">⚠ {storeError}</span>}
        <span className={`zi-role ${canUpload ? 'up' : 'ro'}`}>
          {canUpload ? 'Publishing to admin' : 'View only'}
        </span>
      </div>
    </div>
  );
}