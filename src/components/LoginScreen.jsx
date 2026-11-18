import React, { Suspense, lazy, useState } from 'react';
import { useAuth } from '../auth';

const DataScene = lazy(() => import('../three/DataScene.jsx'));

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
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

  return (
    <div className="zi-landing zi-login">
      <div className="zi-mesh" />
      <div className="zi-grid" />
      <div className="zi-login-scene"><Suspense fallback={null}><DataScene variant="hero" /></Suspense></div>
      <form className="zi-login-card zi-rise" onSubmit={submit} noValidate>
        <div className="zi-brand" style={{ marginBottom: 22 }}>
          <div className="zi-mark">Z</div>
          <div><b>Zuari Insights</b><span>Insurance intelligence platform</span></div>
        </div>
        <h1>Sign in</h1>
        <p className="sub">Uploaders add the Excel reports. Admins view the dashboards built from them.</p>

        <label htmlFor="zi-user">Username</label>
        <input id="zi-user" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />

        <label htmlFor="zi-pass">Password</label>
        <div className="zi-pass">
          <input id="zi-pass" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
        </div>

        {error && <div className="zi-err" role="alert">⚠ {error}</div>}
        <button type="submit" className="zi-login-btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="foot">Session expires after 12 hours.</p>
      </form>
    </div>
  );
}