import React, { useEffect, useState } from 'react';
import { DownloadCloud, Image as ImageIcon, Film, FileText, Folder, Archive, Lock, ArrowRight, AlertTriangle } from 'lucide-react';
import { StorageService } from '../services/api';

export function SharePage({ token, onGoHome }) {
  const [meta, setMeta]                 = useState(null);
  const [error, setError]               = useState(null);
  const [downloaded, setDownloaded]     = useState(false);
  const [password, setPassword]         = useState('');
  const [submittedPassword, setSubmittedPassword] = useState('');
  const [passError, setPassError]       = useState('');
  const [checkingPass, setCheckingPass] = useState(false);

  useEffect(() => {
    StorageService.getShareMetadata(token)
      .then(data => setMeta(data))
      .catch(err => setError(err.message));
  }, [token]);

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setCheckingPass(true);
    setPassError('');
    try {
      const data = await StorageService.getShareMetadata(token, password.trim());
      setMeta(data);
      setSubmittedPassword(password.trim());
    } catch (err) {
      setPassError(err.message || 'Incorrect password');
    } finally {
      setCheckingPass(false);
    }
  };

  if (error) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--rose)', marginBottom: 12 }}>Link Invalid</h2>
          <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  // Password-protected prompt
  if (meta.requiresPassword) {
    return (
      <div className="login-page">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-card" style={{ textAlign: 'center', padding: '36px 24px', maxWidth: 400 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: 'rgba(99,102,241,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--indigo)'
          }}>
            <Lock size={26} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
            Password Required
          </h2>
          <p style={{ color: 'var(--text-3)', fontSize: '0.82rem', marginBottom: 20 }}>
            This shared file is protected. Enter the password to access:
          </p>

          <form onSubmit={handleUnlock}>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="txt-input"
              style={{ width: '100%', marginBottom: 12, textAlign: 'center', fontSize: '0.95rem' }}
              autoFocus
            />

            {passError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: 'var(--rose)', fontSize: '0.82rem', marginBottom: 12 }}>
                <AlertTriangle size={14} /> {passError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={checkingPass || !password.trim()}
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              {checkingPass ? 'Verifying…' : 'Unlock File'}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  const pwdParam = submittedPassword ? `&pwd=${encodeURIComponent(submittedPassword)}` : '';
  const downloadUrl = `${StorageService.getAgentUrl()}/api/s/${meta.downloadToken || token}/download?${pwdParam.slice(1)}`;
  
  const getIcon = () => {
    if (meta.isDir) return <Folder size={48} color="var(--amber)" />;
    if (meta.type === 'image') return <img src={`${downloadUrl}&inline=true`} style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 'var(--r-sm)' }} alt="Preview" />;
    if (meta.type === 'video') return <video src={`${downloadUrl}&inline=true`} controls controlsList="nodownload" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 'var(--r-sm)' }} />;
    if (meta.type === 'archive') return <Archive size={48} color="var(--emerald)" />;
    return <FileText size={48} color="var(--indigo)" />;
  };

  return (
    <div className="login-page">
      {/* Background orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <div className="login-card" style={{ textAlign: 'center', padding: '40px 24px', maxWidth: 460 }}>
        
        {/* Anti-screenshot wrapper if it's an image/video preview */}
        <div 
          style={{ 
            marginBottom: 24, 
            display: 'inline-flex', 
            padding: 20, 
            borderRadius: 'var(--r-lg)', 
            background: 'var(--bg-elevated)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitUserDrag: 'none',
            pointerEvents: 'none'
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {getIcon()}
        </div>

        <h2 style={{ fontSize: '1.2rem', marginBottom: 6, fontWeight: 700, color: 'var(--text-1)', wordBreak: 'break-all' }}>
          {meta.name}
        </h2>
        <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginBottom: 24, fontWeight: 500 }}>
          {meta.size} • {meta.isDir ? 'Folder' : meta.type.toUpperCase()}
        </p>

        {meta.burnAfterReading && (
          <div style={{ padding: '12px 16px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--amber)', borderRadius: 'var(--r-sm)', fontSize: '0.8rem', fontWeight: 600, marginBottom: 24 }}>
            🔥 This file will self-destruct after you download it!
          </div>
        )}

        {meta.expiresAt && (
          <div style={{ padding: '8px 12px', background: 'rgba(139,92,246,0.1)', color: 'var(--violet)', borderRadius: 'var(--r-sm)', fontSize: '0.78rem', marginBottom: 16 }}>
            ⏰ Expires on {new Date(meta.expiresAt).toLocaleString()}
          </div>
        )}

        {meta.downloadLimit && (
          <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.1)', color: 'var(--emerald)', borderRadius: 'var(--r-sm)', fontSize: '0.78rem', marginBottom: 16 }}>
            ⬇ Downloads: {meta.downloadCount || 0} / {meta.downloadLimit}
          </div>
        )}

        {/* Anti-screenshot wrapper on the entire card */}
        <div style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
          {downloaded ? (
            <div className="btn" style={{ width: '100%', justifyContent: 'center', padding: '14px 20px', fontSize: '0.95rem', background: 'var(--bg-card)', color: 'var(--text-3)', cursor: 'not-allowed', border: '1px solid var(--border)' }}>
              🔥 Link Burned
            </div>
          ) : (
            <a 
              href={downloadUrl} 
              className="btn btn-primary" 
              onClick={() => { if (meta.burnAfterReading) setDownloaded(true); }}
              style={{ width: '100%', justifyContent: 'center', padding: '14px 20px', fontSize: '0.95rem' }}
            >
              <DownloadCloud size={20} />
              Download {meta.isDir ? 'Folder (.zip)' : 'File'}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
