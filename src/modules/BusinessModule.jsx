import React, { Suspense, lazy, useState, useRef } from 'react';
import { parseExcel } from '../utils/data';
import Dashboard from '../components/Dashboard';

export default function BusinessModule({ onBack }) {
  const [filesData, setFilesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => f && /\.xlsx?$/i.test(f.name));
    if (!files.length) { setError('Please upload valid Excel files (.xlsx or .xls)'); return; }
    setLoading(true); setError('');
    try {
      const results = [];
      for (const file of files) {
        const parsed = await parseExcel(file);
        if (parsed?.rows?.length) results.push(parsed);
      }
      if (!results.length) { setError('No valid data found'); return; }
      setFilesData(prev => [...prev, ...results]);
    } catch (err) {
      setError(err.message || 'Failed to read file');
    } finally { setLoading(false); }
  };

  const allRows = filesData.flatMap(f => f.rows || []);
  const allYears = [...new Set(filesData.flatMap(f => f.years || []))].sort();

  if (allRows.length > 0) {
    return (
      <Dashboard
        data={allRows}
        filesData={filesData}
        years={allYears}
        onReset={() => { setFilesData([]); setError(''); }}
        onRemoveFile={(name) => setFilesData(prev => prev.filter(f => f.fileName !== name))}
        onAddMore={() => inputRef.current?.click()}
        onBack={onBack}
      />
    );
  }

  return (
    <UploadScreen
      title="Business Dashboard"
      desc="Upload Business Report Excel files. Multiple years supported for comparison."
      color="#2f7bff"
      loading={loading}
      error={error}
      dragOver={dragOver}
      setDragOver={setDragOver}
      onFiles={handleFiles}
      onBack={onBack}
      inputRef={inputRef}
      features={['Multi-file upload', 'FY Comparison', 'Endorsements', 'Monthly trends', 'PDF Export']}
    />
  );
}

const DataScene = lazy(() => import('../three/DataScene.jsx'));

function UploadScreen({ title, desc, loading, error, dragOver, setDragOver, onFiles, onBack, inputRef, features, multiple = true, hint }) {
  return (
    <div className="zi-upload">
      <div className="zi-upload-top">
        <button onClick={onBack}>← Back to dashboards</button>
        <span style={{ fontSize: 12, color: '#b9c6dc', fontWeight: 700, letterSpacing: '.14em' }}>ZUARI INSIGHTS</span>
      </div>
      <div className="zi-upload-body">
        <div className="zi-upload-art zi-rise">
          <span className="zi-chip" style={{ position: 'relative', zIndex: 1 }}>STEP 1 · UPLOAD</span>
          <h2 style={{ marginTop: 14 }}>{title}</h2>
          <p>{desc}</p>
          <div className="scene">
            <Suspense fallback={null}><DataScene variant="compact" /></Suspense>
          </div>
        </div>
        <div className="zi-upload-card zi-rise" style={{ animationDelay: '.08s' }}>
          <div
            className={`zi-drop ${dragOver ? 'on' : ''}`}
            style={loading ? { opacity: 0.7, pointerEvents: 'none' } : undefined}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          >
            <div className="ring">
              {loading
                ? <span style={{ width: 26, height: 26, border: '3px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                : <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>}
            </div>
            <p style={{ fontWeight: 800, fontSize: 17, color: '#0c1a33' }}>{loading ? 'Reading your file…' : 'Drag & drop Excel files here'}</p>
            <p style={{ color: '#6b7a92', fontSize: 13, marginTop: 4 }}>{hint || 'or click to browse'}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <span className="zi-badge">.xlsx</span>
              <span className="zi-badge">.xls</span>
            </div>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple={multiple} hidden onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
          {error && <div className="zi-err">⚠ {error}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            {features.map(f => <span key={f} className="zi-pill">{f}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export { UploadScreen };