import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, Wifi } from 'lucide-react';

export function LoginPage({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      triggerError('Password is required');
      return;
    }
    setLoading(true);
    setError('');

    // Verify password against agent
    try {
      const agentUrl = localStorage.getItem('AGENT_URL') || 'https://api.hcdavecloud.in';
      const res = await fetch(`${agentUrl}/api/drives`, {
        headers: { Authorization: `Bearer ${password}` }
      });

      if (res.ok) {
        localStorage.setItem('HCDAVE_AUTH_TOKEN', password);
        onSuccess();
      } else {
        triggerError('Incorrect password. Access denied.');
      }
    } catch {
      // If network unreachable, still save token and try
      localStorage.setItem('HCDAVE_AUTH_TOKEN', password);
      onSuccess();
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
      {/* Animated background orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className={`login-card ${shake ? 'login-shake' : ''}`}>
        {/* Logo */}
        <div className="login-logo-wrap">
          <div className="login-logo">
            <Wifi size={30} />
          </div>
        </div>

        <h1 className="login-heading">HC Dave Cloud</h1>
        <p className="login-subheading">
          Enter your security password to access<br />your private home storage drives.
        </p>

        <form onSubmit={handleSubmit}>
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

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? <div className="spinner" /> : <Lock size={16} />}
            <span>{loading ? 'Verifying...' : 'Unlock Drive'}</span>
          </button>
        </form>

        <div className="login-footer">
          <ShieldCheck size={14} color="var(--emerald)" />
          <span>End-to-end encrypted via Cloudflare</span>
        </div>
      </div>
    </div>
  );
}
