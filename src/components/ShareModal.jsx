import React, { useState, useEffect } from 'react';
import { X, Share2, Copy, Check, Flame, Lock, Calendar, Download, Trash2, RefreshCw, Eye } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { StorageService } from '../services/api';

export function ShareModal({ file, files, driveId, onClose }) {
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [shareLink, setShareLink] = useState(null);
  const [shareToken, setShareToken] = useState(null);
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [copied, setCopied]       = useState(false);

  // Enhanced options
  const [password, setPassword]       = useState('');
  const [expiryDays, setExpiryDays]   = useState('');
  const [downloadLimit, setDownloadLimit] = useState('');
  const [saving, setSaving]           = useState(false);
  const [savedOk, setSavedOk]         = useState(false);

  // Manage existing shares
  const [allShares, setAllShares]     = useState([]);
  const [sharesTab, setSharesTab]     = useState('new'); // 'new' | 'manage'
  const [sharesLoading, setSharesLoading] = useState(false);
  const [revoking, setRevoking]       = useState(null);

  const selectedItems = files || (file ? [file] : []);
  const targetPaths   = selectedItems.map(item => typeof item === 'string' ? item : item.path);
  const displayName   = selectedItems.length === 1
    ? (selectedItems[0].name || selectedItems[0].path || 'File')
    : `${selectedItems.length} selected items`;

  useEffect(() => {
    if (sharesTab !== 'new') return;
    let isMounted = true;
    if (targetPaths.length === 0) return;

    StorageService.createShareLink(driveId, targetPaths.length === 1 ? targetPaths[0] : targetPaths, false)
      .then(data => {
        if (isMounted) {
          setShareToken(data.token);
          setShareLink(`${window.location.origin}/s/${data.token}`);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) { setError(err.message); setLoading(false); }
      });
    return () => { isMounted = false; };
  }, [driveId, targetPaths.join(','), sharesTab]);

  useEffect(() => {
    if (sharesTab !== 'manage') return;
    loadShares();
  }, [sharesTab]);

  const loadShares = async () => {
    setSharesLoading(true);
    try {
      const data = await StorageService.listShares();
      setAllShares(data || []);
    } catch {} finally {
      setSharesLoading(false);
    }
  };

  const handleBurnToggle = async (checked) => {
    setBurnAfterReading(checked);
    if (shareToken) {
      try { await StorageService.updateShareLink(shareToken, { burnAfterReading: checked }); } catch {}
    }
  };

  const handleSaveOptions = async () => {
    if (!shareToken) return;
    setSaving(true);
    try {
      await StorageService.updateShareLink(shareToken, {
        burnAfterReading,
        password: password || null,
        expiresAt: expiryDays ? new Date(Date.now() + Number(expiryDays) * 86400000).toISOString() : null,
        downloadLimit: downloadLimit ? Number(downloadLimit) : null,
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const handleCopy = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async (token) => {
    setRevoking(token);
    try {
      await StorageService.revokeShare(token);
      setAllShares(p => p.filter(s => s.token !== token));
    } catch {} finally { setRevoking(null); }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, onClose]);

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-label="Share Items"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <div className="modal-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Share2 size={20} color="var(--indigo)" />
            <span className="modal-title">Share {selectedItems.length > 1 ? 'Items' : (selectedItems[0]?.type === 'folder' ? 'Folder' : 'File')}</span>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {displayName}
        </p>

        {/* Tab bar */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 4, marginBottom: 16, gap: 4 }}>
          {['new', 'manage'].map(t => (
            <button key={t} onClick={() => setSharesTab(t)} style={{
              flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 600,
              background: sharesTab === t ? 'var(--bg-card)' : 'transparent',
              color: sharesTab === t ? 'var(--text-1)' : 'var(--text-3)'
            }}>
              {t === 'new' ? '➕ Create Link' : '📋 Manage Links'}
            </button>
          ))}
        </div>

        {/* ── Create tab ── */}
        {sharesTab === 'new' && (
          <>
            {error ? (
              <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', color: 'var(--rose)', borderRadius: 'var(--r-sm)', fontSize: '0.85rem' }}>{error}</div>
            ) : loading ? (
              <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.3s ease' }}>
                {/* QR */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ background: '#fff', padding: 12, borderRadius: 'var(--r-md)', boxShadow: '0 8px 32px rgba(99,102,241,0.15)' }}>
                    <QRCodeSVG value={shareLink} size={150} level="H" includeMargin={false} />
                  </div>
                </div>

                {/* Link */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={shareLink} readOnly className="input"
                    style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-2)' }} />
                  <button className="btn btn-primary" onClick={handleCopy} style={{ padding: '0 14px' }}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Burn */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'var(--bg-card)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                    <input type="checkbox" checked={burnAfterReading} onChange={e => handleBurnToggle(e.target.checked)}
                      style={{ accentColor: 'var(--amber)', width: 15, height: 15 }} />
                    <div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-1)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Flame size={14} color="var(--amber)" /> Burn after reading
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Self-destructs after 1 view</div>
                    </div>
                  </label>

                  {/* Password */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                    <Lock size={14} color="var(--cyan)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 4 }}>Password (optional)</div>
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Leave blank for no password"
                        style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: '0.85rem' }} />
                    </div>
                  </div>

                  {/* Expiry */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                      <Calendar size={14} color="var(--violet)" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 4 }}>Expires after (days)</div>
                        <input type="number" value={expiryDays} onChange={e => setExpiryDays(e.target.value)}
                          placeholder="Never" min="1"
                          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: '0.85rem' }} />
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                      <Download size={14} color="var(--emerald)" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 4 }}>Download limit</div>
                        <input type="number" value={downloadLimit} onChange={e => setDownloadLimit(e.target.value)}
                          placeholder="Unlimited" min="1"
                          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: '0.85rem' }} />
                      </div>
                    </div>
                  </div>

                  <button className="btn btn-primary" onClick={handleSaveOptions} disabled={saving} style={{ width: '100%' }}>
                    {saving ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                    {savedOk ? '✅ Options Saved!' : saving ? 'Saving…' : 'Save Link Options'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Manage tab ── */}
        {sharesTab === 'manage' && (
          <div>
            {sharesLoading ? (
              <div style={{ padding: '30px 0', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
            ) : allShares.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-3)', fontSize: '0.85rem' }}>No active share links</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                {allShares.map(s => (
                  <div key={s.token} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                        {s.filePath ? s.filePath.split('/').pop() : `${s.filePaths?.length || 0} files`}
                      </span>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/s/${s.token}`); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }} title="Copy link">
                          <Copy size={13} />
                        </button>
                        <button onClick={() => handleRevoke(s.token)} disabled={revoking === s.token}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rose)', display: 'flex' }} title="Revoke link">
                          {revoking === s.token ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {s.burnAfterReading && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' }}>🔥 Burn</span>}
                      {s.password && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(34,211,238,0.15)', color: 'var(--cyan)' }}>🔒 Password</span>}
                      {s.expiresAt && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(139,92,246,0.15)', color: 'var(--violet)' }}>
                        ⏰ {new Date(s.expiresAt).toLocaleDateString()}
                      </span>}
                      {s.downloadLimit && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: 'var(--emerald)' }}>
                        ⬇ {s.downloadCount || 0}/{s.downloadLimit}
                      </span>}
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginLeft: 'auto' }}>
                        {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
