import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, WifiOff } from 'lucide-react';

export function LoginPage({ onSuccess, onOpenSettings }) {
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [shake,    setShake]    = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      triggerError('Password is required.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const agentUrl = (localStorage.getItem('AGENT_URL') || 'https://api.hcdavecloud.in').replace(/\/$/, '');
      const res = await fetch(`${agentUrl}/api/drives`, {
        headers: { Authorization: `Bearer ${password}` },
        signal: AbortSignal.timeout(8000), // 8 s timeout
      });

      if (res.ok) {
        localStorage.setItem('HCDAVE_AUTH_TOKEN', password);
        onSuccess();
      } else if (res.status === 401 || res.status === 403) {
        triggerError('Incorrect password. Access denied.');
      } else {
        triggerError(`Agent returned an error (${res.status}). Check the agent URL in settings.`);
      }
    } catch (err) {
      // NEVER auto-login on network failure — agent must be reachable
      if (err.name === 'TimeoutError') {
        triggerError('Connection timed out. Is the agent running?');
      } else {
        triggerError('Cannot reach the storage agent. Check your internet or agent URL.');
      }
    } finally {
      setLoading(false);
    }
  };

  const triggerError = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  return (
    <div className="login-page">
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className={`login-card ${shake ? 'login-shake' : ''}`}>
        {/* Logo mark */}
        <div className="login-logo-wrap">
          <div className="login-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 24V8h6c4.4 0 8 3.6 8 8s-3.6 8-8 8H8z"
                fill="url(#dgrad)" strokeWidth="0" />
              <defs>
                <linearGradient id="dgrad" x1="8" y1="8" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#fff" />
                  <stop offset="1" stopColor="rgba(255,255,255,0.6)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        <h1 className="login-heading">HC Dave Cloud</h1>
        <p className="login-subheading">
          Enter your password to unlock<br />your private home storage.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field-label">
              <Lock size={12} />
              <span>Security Password</span>
            </label>
            <div className="field-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                className={`field-input ${error ? 'error' : ''}`}
                placeholder="Enter your password..."
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoFocus
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="field-toggle"
                onClick={() => setShowPwd(!showPwd)}
                tabIndex={-1}
              >
                {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {error && (
              <div className="error-msg">
                <AlertCircle size={13} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={loading}
          >
            {loading ? <div className="spinner" /> : <Lock size={16} />}
            <span>{loading ? 'Verifying...' : 'Unlock Drive'}</span>
          </button>
        </form>

        {/* Agent offline hint */}
        {error && error.includes('agent') && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--r-sm)', fontSize: '0.76rem', color: 'var(--amber)', lineHeight: 1.7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 }}>
              <WifiOff size={13} /> Agent offline?
            </div>
            If you are running the agent locally, click here to{' '}
            <button 
              type="button" 
              onClick={onOpenSettings} 
              style={{ background: 'none', border: 'none', color: 'var(--amber)', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit', fontWeight: 600 }}
            >
              open Config
            </button> 
            {' '}and change the URL to http://localhost:3001.
          </div>
        )}

        <div className="login-footer">
          <ShieldCheck size={14} color="var(--emerald)" />
          <span>Password verified against your home agent</span>
        </div>
      </div>
    </div>
  );
}
