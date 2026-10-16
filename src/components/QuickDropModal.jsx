import React, { useState, useEffect, useRef } from 'react';
import {
  X, QrCode, Copy, Check, ExternalLink, HardDrive, Folder, Clock,
  Smartphone, RefreshCw, CheckCircle2, ArrowRight
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { StorageService } from '../services/api';

export function QuickDropModal({
  isOpen,
  onClose,
  drives = [],
  activeDriveId,
  currentPath = '/',
  onFilesReceived
}) {
  const [selectedDriveId, setSelectedDriveId] = useState(activeDriveId || (drives[0]?.id || ''));
  const [folder, setFolder]                 = useState(currentPath || '/');
  const [expiryMinutes, setExpiryMinutes]   = useState(60);
  const [session, setSession]               = useState(null);
  const [isCreating, setIsCreating]         = useState(false);
  const [errorMsg, setErrorMsg]             = useState('');
  const [copied, setCopied]                 = useState(false);
  const [status, setStatus]                 = useState(null);
  const pollTimerRef                        = useRef(null);

  // Sync defaults
  useEffect(() => {
    if (activeDriveId) setSelectedDriveId(activeDriveId);
    if (currentPath) setFolder(currentPath);
  }, [activeDriveId, currentPath, isOpen]);

  // Create session automatically when modal opens if not already created
  const createSession = async () => {
    setIsCreating(true);
    setErrorMsg('');
    try {
      const res = await StorageService.createQuickDrop({
        driveId: selectedDriveId,
        folder: folder.trim() || '/',
        expiryMinutes: parseInt(expiryMinutes, 10)
      });
      setSession(res);
      setStatus({ uploadedCount: 0, uploadedFiles: [] });
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create QuickDrop session');
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    if (isOpen && !session) {
      createSession();
    }
  }, [isOpen]);

  // Poll status while open and session active
  useEffect(() => {
    if (!isOpen || !session?.token) return;

    const pollStatus = async () => {
      try {
        const s = await StorageService.getQuickDropStatus(session.token);
        setStatus(prev => {
          if (s.uploadedCount > (prev?.uploadedCount || 0) && onFilesReceived) {
            onFilesReceived();
          }
          return s;
        });
      } catch (_) {}
    };

    pollTimerRef.current = setInterval(pollStatus, 2000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, session, onFilesReceived]);

  if (!isOpen) return null;

  const dropUrl = session?.token ? `${window.location.origin}/drop/${session.token}` : '';

  const handleCopyLink = () => {
    if (!dropUrl) return;
    navigator.clipboard.writeText(dropUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-box"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 580,
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(34,211,238,0.2))',
              border: '1px solid rgba(16,185,129,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--emerald)'
            }}>
              <QrCode size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-1)' }}>
                QuickDrop — Phone to Cloud
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                Scan with any phone camera to transfer photos, scans &amp; files directly
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            style={{ color: 'var(--text-3)' }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Target destination bar */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
              <HardDrive size={15} color="var(--indigo)" />
              <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                {session?.driveName || drives.find(d => d.id === selectedDriveId)?.name || 'Drive'}
              </span>
              <span style={{ color: 'var(--text-3)' }}>•</span>
              <Folder size={15} color="var(--amber)" />
              <span style={{ color: 'var(--text-2)', fontFamily: 'monospace' }}>
                {session?.folder || folder}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-3)' }}>
              <Clock size={13} />
              <span>Expires in {expiryMinutes}m</span>
            </div>
          </div>

          {errorMsg && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(244,63,94,0.12)',
              border: '1px solid rgba(244,63,94,0.3)',
              borderRadius: 8,
              color: 'var(--rose)',
              fontSize: '0.82rem',
              marginBottom: 16
            }}>
              {errorMsg}
            </div>
          )}

          {isCreating ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
              <div>Generating secure QuickDrop link…</div>
            </div>
          ) : session ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* QR Code Container */}
              <div style={{
                background: '#ffffff',
                padding: 16,
                borderRadius: 16,
                boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                marginBottom: 16,
                display: 'inline-block'
              }}>
                <QRCodeSVG
                  value={dropUrl}
                  size={210}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* Instructions */}
              <div style={{
                textAlign: 'center',
                fontSize: '0.82rem',
                color: 'var(--text-2)',
                marginBottom: 16,
                maxWidth: 360,
                lineHeight: 1.4
              }}>
                Point phone camera at this QR code. Open the link to upload camera snaps or documents instantly. No login needed.
              </div>

              {/* Copy URL Box */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: '4px 6px 4px 12px',
                marginBottom: 20
              }}>
                <input
                  type="text"
                  readOnly
                  value={dropUrl}
                  className="txt-input"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    fontSize: '0.8rem',
                    color: 'var(--text-2)',
                    flex: 1,
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleCopyLink}
                  className="btn btn-ghost"
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    flexShrink: 0,
                    gap: 5
                  }}
                >
                  {copied ? <Check size={14} color="var(--emerald)" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>

              {/* Live Upload Feed */}
              <div style={{ width: '100%' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)' }}>
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--emerald)',
                      animation: 'pulse 1.5s infinite'
                    }} />
                    <span>Live Receiver</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                    {status?.uploadedCount || 0} file(s) received
                  </span>
                </div>

                {status?.uploadedFiles?.length > 0 ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    maxHeight: 140,
                    overflowY: 'auto'
                  }}>
                    {status.uploadedFiles.slice().reverse().map((f, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'rgba(16,185,129,0.08)',
                          border: '1px solid rgba(16,185,129,0.2)',
                          borderRadius: 6,
                          padding: '6px 10px',
                          fontSize: '0.78rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <CheckCircle2 size={13} color="var(--emerald)" />
                          <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{f.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: '0.72rem', flexShrink: 0 }}>
                          <span>{f.size}</span>
                          <span>•</span>
                          <span>{f.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    color: 'var(--text-3)'
                  }}>
                    Waiting for uploads from phone…
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.015)'
        }}>
          <button
            onClick={createSession}
            disabled={isCreating}
            className="btn btn-ghost"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
          >
            <RefreshCw size={13} className={isCreating ? 'spin' : ''} />
            <span>New Session</span>
          </button>

          <button
            onClick={() => {
              if (status?.uploadedCount > 0 && onFilesReceived) {
                onFilesReceived();
              }
              onClose();
            }}
            className="btn btn-primary"
            style={{ padding: '6px 20px', fontSize: '0.85rem' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
