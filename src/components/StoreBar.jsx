import React from 'react';
import { fmtWhen } from '../api';

/* Thin strip under a dashboard header: who uploaded the data shown, plus save progress / errors. */
export default function StoreBar({ store }) {
  const { stored, latest, saving, storeError, canUpload } = store;
  if (!stored.length && !saving && !storeError) return null;
  return (
    <div className="zi-storebar">
      {latest && (
        <span>
          <b>{stored.length} file{stored.length > 1 ? 's' : ''}</b> on the server · last uploaded by <b>{latest.uploadedBy}</b> on {fmtWhen(latest.uploadedAt)}
          {stored.length > 1 && <em> ({stored.map((m) => m.name).join(', ')})</em>}
        </span>
      )}
      {!canUpload && <span className="zi-ro">VIEW ONLY</span>}
      {saving && <span className="zi-saving">{saving}</span>}
      {storeError && <span className="zi-storeerr">⚠ {storeError}</span>}
    </div>
  );
}