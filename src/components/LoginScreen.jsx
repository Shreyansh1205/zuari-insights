import React, { Suspense, lazy, useState } from 'react';
import { useAuth } from '../auth';

const DataScene = lazy(() => import('../three/DataScene.jsx'));

const I = {
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a18.6 18.6 0 0 1 4.1-5.1" /><path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a18.7 18.7 0 0 1-2.2 3.2" /><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" /><path d="M2 2l20 20" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15l2 2 4-4" /></>,
  alert: <><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
};
const Svg = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError('Enter your username and password.'); return; }
    setBusy(true); setError('');
    try { await login(username.trim(), password); }
    catch (err) { setError(err.message || 'Sign-in failed'); }
    finally { setBusy(false); }
  };
  const capsCheck = (e) => setCaps(!!e.getModifierState?.('CapsLock'));

  return (
    <div className="zl">
      <div className="zi-mesh" />
      <div className="zi-grid" />

      <section className="zl-art">
        <div className="zl-scene"><Suspense fallback={null}><DataScene variant="hero" /></Suspense></div>
        <div className="zi-brand zl-rise">
          <div className="zi-mark">Z</div>
          <div><b>Zuari Insights</b><span>Insurance intelligence platform</span></div>
        </div>
        <div className="zl-copy zl-rise" style={{ animationDelay: '.08s' }}>
          <span className="zi-chip"><span className="zi-dot" />SECURE WORKSPACE</span>
          <h1>Every report,<br /><em>one source of truth.</em></h1>
          <ul>
            <li><span><Svg d={I.file} /></span><div><b>Upload once</b><small>Excel reports are stored centrally and versioned.</small></div></li>
            <li><span><Svg d={I.chart} /></span><div><b>Live dashboards</b><small>Management sees the latest data the moment it lands.</small></div></li>
            <li><span><Svg d={I.shield} /></span><div><b>Role-based access</b><small>Uploader and admin views, signed sessions.</small></div></li>
          </ul>
        </div>
        <p className="zl-legal zl-rise" style={{ animationDelay: '.16s' }}>© {new Date().getFullYear()} Zuari Insurance Brokers · Internal use only</p>
      </section>

      <section className="zl-side">
        <form className="zl-card zl-rise" style={{ animationDelay: '.1s' }} onSubmit={submit} noValidate>
          <div className="zl-card-top">
            <div className="zi-mark sm">Z</div>
            <span>Zuari Insights</span>
          </div>
          <h2>Welcome back</h2>
          <p className="zl-sub">Sign in with the account you were given.</p>

          <label htmlFor="zi-user">Username</label>
          <div className="zl-field">
            <Svg d={I.user} />
            <input id="zi-user" autoComplete="username" placeholder="e.g. uploader" value={username}
              onChange={(e) => setUsername(e.target.value)} autoFocus spellCheck={false} autoCapitalize="none" />
          </div>

          <label htmlFor="zi-pass">Password</label>
          <div className="zl-field">
            <Svg d={I.lock} />
            <input id="zi-pass" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} onKeyUp={capsCheck} onKeyDown={capsCheck} />
            <button type="button" className="zl-eye" onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
              <Svg d={show ? I.eyeOff : I.eye} />
            </button>
          </div>
          {caps && <p className="zl-caps"><Svg d={I.alert} size={14} /> Caps Lock is on</p>}

          {error && <div className="zl-err" role="alert"><Svg d={I.alert} size={16} /> {error}</div>}

          <button type="submit" className="zl-btn" disabled={busy}>
            {busy ? <><span className="zl-spin" /> Signing in…</> : 'Sign in'}
          </button>

          <div className="zl-foot">
            <Svg d={I.shield} size={14} /> Encrypted connection · session ends after 12 hours
          </div>
        </form>
      </section>
    </div>
  );
}