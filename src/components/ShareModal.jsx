import React, { useState, useEffect } from 'react';
import { X, Share2, Copy, Check, Flame } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { StorageService } from '../services/api';

export function ShareModal({ file, driveId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareLink, setShareLink] = useState(null);
  const [shareToken, setShareToken] = useState(null);
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    StorageService.createShareLink(driveId, file.path, false)
      .then(data => {
        if (isMounted) {
          setShareToken(data.token);
          setShareLink(`${window.location.origin}/s/${data.token}`);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { isMounted = false; };
  }, [driveId, file.path]);

  const handleBurnToggle = async (checked) => {
    setBurnAfterReading(checked);
    if (shareToken) {
      try {
        await StorageService.updateShareLink(shareToken, checked);
      } catch (err) {
        console.error('Failed to update burn status', err);
      }
    }
  };

  const handleCopy = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Share2 size={20} color="var(--indigo)" />
            <span className="modal-title">Share {file.type === 'folder' ? 'Folder' : 'File'}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: 20 }}>
          {file.name}
        </p>

        {error ? (
          <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', color: 'var(--rose)', borderRadius: 'var(--r-sm)', fontSize: '0.85rem' }}>
            {error}
          </div>
        ) : loading ? (
          <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, animation: 'fadeIn 0.3s ease' }}>
            
            <div style={{ background: '#fff', padding: 16, borderRadius: 'var(--r-md)', boxShadow: '0 8px 32px rgba(99,102,241,0.15)' }}>
              <QRCodeSVG value={shareLink} size={180} level="H" includeMargin={false} />
            </div>

            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  type="text" 
                  value={shareLink} 
                  readOnly 
                  className="input" 
                  style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-2)' }} 
                />
                <button className="btn btn-primary" onClick={handleCopy} style={{ padding: '0 16px' }}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div style={{ width: '100%' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'var(--bg-card)', padding: '12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <input 
                  type="checkbox" 
                  checked={burnAfterReading} 
                  onChange={(e) => handleBurnToggle(e.target.checked)} 
                  style={{ accentColor: 'var(--amber)', width: 16, height: 16 }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-1)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Flame size={16} color="var(--amber)" /> Burn after reading
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Link self-destructs after 1 view/download.</span>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
