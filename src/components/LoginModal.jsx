import React, { useState } from 'react';
import { Lock, KeyRound, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { StorageService } from '../services/api';

export function LoginModal({ onLoginSuccess }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter your access password');
      return;
    }

    // Save token and authorize
    StorageService.setAuthToken(password);
    onLoginSuccess();
  };

  return (
    <div className="modal-overlay" style={{ backdropFilter: 'blur(16px)', background: 'rgba(5, 8, 15, 0.88)' }}>
      <div className="modal-content" style={{ maxWidth: '420px', padding: '36px 28px', textAlign: 'center' }}>
        <div 
          style={{ 
            width: 64, 
            height: 64, 
            borderRadius: '16px', 
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 20px',
            color: '#fff',
            boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)'
          }}
        >
          <Lock size={32} />
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 6 }}>HC Dave Cloud Access</h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
          Enter password to unlock your home storage drives
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ textAlign: 'left', position: 'relative' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <KeyRound size={14} color="var(--accent-cyan)" />
              <span>Security Password</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? 'text' : 'password'} 
                className="form-input" 
                placeholder="Enter password..." 
                value={password} 
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                autoFocus
                style={{ paddingRight: '42px' }}
              />
              <button 
                type="button"
                className="icon-btn" 
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: 'var(--accent-rose)', fontSize: '0.8rem', marginBottom: 16, textAlign: 'left' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
            <span>Unlock Drive</span>
            <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <ShieldCheck size={16} color="var(--accent-emerald)" />
          <span>Protected by AES-256 Cloudflare Encryption</span>
        </div>
      </div>
    </div>
  );
}
