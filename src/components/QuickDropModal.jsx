import React, { useState, useEffect, useRef } from 'react';
import {
  X, QrCode, Copy, Check, ExternalLink, HardDrive, Folder, Clock,
  Smartphone, RefreshCw, CheckCircle2, Shield, Settings2, Plus, AlertTriangle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { StorageService } from '../services/api';

const EXPIRY_PRESETS = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 60, label: '60m' },
  { value: 120, label: '2h' },
  { value: 360, label: '6h' },
  { value: 1440, label: '24h' }
];

const EXPIRY_DROPDOWN_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour (60m - default)' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 360, label: '6 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '24 hours (1 day)' },
  { value: 'custom', label: 'Custom duration…' }
];

const QUOTA_OPTIONS = [
  { value: 1 * 1024 * 1024 * 1024, label: '1 GB' },
  { value: 5 * 1024 * 1024 * 1024, label: '5 GB' },
  { value: 20 * 1024 * 1024 * 1024, label: '20 GB' },
  { value: 50 * 1024 * 1024 * 1024, label: '50 GB' },
  { value: 100 * 1024 * 1024 * 1024, label: '100 GB' }
];

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
  const [customExpiryInput, setCustomExpiryInput] = useState('');
  const [showCustomExpiry, setShowCustomExpiry] = useState(false);
  const [maxTotalBytes, setMaxTotalBytes]   = useState(50 * 1024 * 1024 * 1024); // 50 GB default
  const [maxFileBytes, setMaxFileBytes]     = useState(20 * 1024 * 1024 * 1024); // 20 GB default
  const [session, setSession]               = useState(null);
  const [isCreating, setIsCreating]         = useState(false);
  const [isExtending, setIsExtending]       = useState(false);
  const [errorMsg, setErrorMsg]             = useState('');
  const [successNotice, setSuccessNotice]   = useState('');
  const [copied, setCopied]                 = useState(false);
  const [status, setStatus]                 = useState(null);
  const [showDriveConfig, setShowDriveConfig] = useState(false);
  const [remainingTimeStr, setRemainingTimeStr] = useState('');
  const pollTimerRef                        = useRef(null);

  // Sync defaults
  useEffect(() => {
    if (activeDriveId) setSelectedDriveId(activeDriveId);
    if (currentPath) setFolder(currentPath);
  }, [activeDriveId, currentPath, isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Create session
  const createSession = async (customTotal, customFile, customExpiry, customDrive, customFolder) => {
    setIsCreating(true);
    setErrorMsg('');
    try {
      const activeExpiry = customExpiry !== undefined ? parseInt(customExpiry, 10) : parseInt(expiryMinutes, 10);
      const activeDrive  = customDrive !== undefined ? customDrive : selectedDriveId;
      const activeFolder = customFolder !== undefined ? customFolder : folder;
      const res = await StorageService.createQuickDrop({
        driveId: activeDrive,
        folder: (activeFolder || '/').trim() || '/',
        expiryMinutes: activeExpiry,
        maxFileBytes: customFile !== undefined ? Number(customFile) : Number(maxFileBytes),
        maxTotalBytes: customTotal !== undefined ? Number(customTotal) : Number(maxTotalBytes)
      });
      setSession(res);
      setStatus({ uploadedCount: 0, uploadedFiles: [] });
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create QuickDrop session');
    } finally {
      setIsCreating(false);
    }
  };

  // Extend or adjust session expiry in place without regenerating token or interrupting uploads
  const extendSessionInPlace = async (extendMins, newTotalMins) => {
    if (!session?.token) {
      createSession(maxTotalBytes, maxFileBytes, newTotalMins || extendMins);
      return;
    }
    setIsExtending(true);
    setErrorMsg('');
    try {
      const payload = extendMins
        ? { extendMinutes: extendMins }
        : { expiryMinutes: newTotalMins };
      const res = await StorageService.extendQuickDrop(session.token, payload);
      setSession(prev => prev ? { ...prev, expiresAt: res.expiresAt } : prev);
      if (newTotalMins) setExpiryMinutes(newTotalMins);
      setSuccessNotice(extendMins ? `Extended session by +${extendMins}m` : `Session expiry updated to ${newTotalMins}m`);
      setTimeout(() => setSuccessNotice(''), 3000);
    } catch (err) {
      // If extend fails (e.g. backend expired), recreate session
      createSession(maxTotalBytes, maxFileBytes, newTotalMins || expiryMinutes);
    } finally {
      setIsExtending(false);
    }
  };

  useEffect(() => {
    if (isOpen && !session) {
      createSession();
    }
  }, [isOpen]);

  // Live countdown timer
  useEffect(() => {
    if (!session?.expiresAt) return;
    const updateCountdown = () => {
      const diff = Math.max(0, session.expiresAt - Date.now());
      if (diff <= 0) {
        setRemainingTimeStr('Expired');
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (h > 0) {
        setRemainingTimeStr(`${h}h ${m}m ${s}s left`);
      } else if (m > 0) {
        setRemainingTimeStr(`${m}m ${s}s left`);
      } else {
        setRemainingTimeStr(`${s}s left`);
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [session?.expiresAt]);

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

  const handleSelectExpiryPreset = (val) => {
    setShowCustomExpiry(false);
    setExpiryMinutes(val);
    extendSessionInPlace(null, val);
  };

  const handleDropdownExpiryChange = (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      setShowCustomExpiry(true);
    } else {
      setShowCustomExpiry(false);
      const mins = Number(val);
      setExpiryMinutes(mins);
      extendSessionInPlace(null, mins);
    }
  };

  const handleApplyCustomExpiry = (e) => {
    e.preventDefault();
    const mins = parseInt(customExpiryInput, 10);
    if (!mins || mins <= 0 || mins > 43200) {
      setErrorMsg('Please enter a valid expiry duration between 1 and 43200 minutes (30 days).');
      return;
    }
    setExpiryMinutes(mins);
    setShowCustomExpiry(false);
    setCustomExpiryInput('');
    extendSessionInPlace(null, mins);
  };

  const handleQuotaChange = (newQuota) => {
    const val = Number(newQuota);
    setMaxTotalBytes(val);
    createSession(val, maxFileBytes, expiryMinutes);
  };

  const handleDriveChange = (newDriveId) => {
    setSelectedDriveId(newDriveId);
    createSession(maxTotalBytes, maxFileBytes, expiryMinutes, newDriveId);
  };

  const isExpired = remainingTimeStr === 'Expired';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickdrop-title"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 620,
          width: '95%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 20
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(34,211,238,0.25))',
              border: '1px solid rgba(16,185,129,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--emerald)',
              boxShadow: '0 0 20px rgba(16,185,129,0.2)'
            }}>
              <QrCode size={22} />
            </div>
            <div>
              <div id="quickdrop-title" style={{ fontSize: '1.08rem', fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>QuickDrop — Phone to Cloud</span>
                <span style={{
                  fontSize: '0.65rem',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: isExpired ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)',
                  border: isExpired ? '1px solid rgba(244,63,94,0.35)' : '1px solid rgba(16,185,129,0.35)',
                  color: isExpired ? 'var(--rose)' : 'var(--emerald)',
                  fontWeight: 700
                }}>
                  {isExpired ? 'Session Expired' : 'Live Sync'}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                Point smartphone camera to transfer photos, documents &amp; camera snaps directly
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            aria-label="Close"
            style={{ color: 'var(--text-3)', padding: 8, borderRadius: 8 }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
          
          {/* ── EXPIRY TIME SELECTOR (Prominent, intuitive & adjustable) ── */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(245,158,11,0.06), rgba(255,255,255,0.015))',
            border: '1px solid rgba(245,158,11,0.22)',
            borderRadius: 14,
            padding: '12px 16px',
            marginBottom: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Clock size={16} color="var(--amber)" />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)' }}>
                  Session Expiration
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: isExpired ? 'var(--rose)' : 'var(--amber)',
                  background: isExpired ? 'rgba(244,63,94,0.14)' : 'rgba(245,158,11,0.12)',
                  border: isExpired ? '1px solid rgba(244,63,94,0.3)' : '1px solid rgba(245,158,11,0.25)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: isExpired ? 'var(--rose)' : 'var(--amber)',
                    animation: isExpired ? 'none' : 'pulse 1.5s infinite'
                  }} />
                  {remainingTimeStr || `Expires in ${expiryMinutes}m`}
                </span>
              </div>

              {/* Quick Extend Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => extendSessionInPlace(30)}
                  disabled={isExtending || isCreating}
                  className="btn btn-ghost"
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    height: 28,
                    gap: 3,
                    color: 'var(--amber)',
                    background: 'rgba(245,158,11,0.1)',
                    border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: 8
                  }}
                  title="Add 30 minutes to current session without resetting QR code"
                >
                  <Plus size={11} />
                  <span>+30m</span>
                </button>
                <button
                  type="button"
                  onClick={() => extendSessionInPlace(60)}
                  disabled={isExtending || isCreating}
                  className="btn btn-ghost"
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    height: 28,
                    gap: 3,
                    color: 'var(--amber)',
                    background: 'rgba(245,158,11,0.1)',
                    border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: 8
                  }}
                  title="Add 1 hour to current session without resetting QR code"
                >
                  <Plus size={11} />
                  <span>+1h</span>
                </button>
              </div>
            </div>

            {/* Presets and Dropdown Selector Row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8
            }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600 }}>Presets:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {EXPIRY_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleSelectExpiryPreset(preset.value)}
                    disabled={isExtending || isCreating}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      borderRadius: 8,
                      border: expiryMinutes === preset.value && !showCustomExpiry
                        ? '1px solid var(--amber)'
                        : '1px solid rgba(255,255,255,0.1)',
                      background: expiryMinutes === preset.value && !showCustomExpiry
                        ? 'rgba(245,158,11,0.2)'
                        : 'rgba(255,255,255,0.03)',
                      color: expiryMinutes === preset.value && !showCustomExpiry
                        ? 'var(--amber)'
                        : 'var(--text-2)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Dropdown Selector */}
              <div style={{ marginLeft: 'auto', minWidth: 150 }}>
                <select
                  value={showCustomExpiry ? 'custom' : expiryMinutes}
                  onChange={handleDropdownExpiryChange}
                  disabled={isExtending || isCreating}
                  className="custom-select custom-select-sm"
                  aria-label="Adjust expiration time"
                  style={{ width: '100%' }}
                >
                  {EXPIRY_DROPDOWN_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom Minutes Input if selected */}
            {showCustomExpiry && (
              <form onSubmit={handleApplyCustomExpiry} style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>Custom:</span>
                <input
                  type="number"
                  min="1"
                  max="43200"
                  placeholder="Minutes (e.g. 90)"
                  value={customExpiryInput}
                  onChange={e => setCustomExpiryInput(e.target.value)}
                  className="txt-input"
                  style={{ width: 140, height: 32, fontSize: '0.78rem', padding: '4px 8px' }}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!customExpiryInput || isExtending}
                  className="btn btn-primary"
                  style={{ padding: '4px 12px', fontSize: '0.74rem', height: 32 }}
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomExpiry(false)}
                  className="btn btn-ghost"
                  style={{ padding: '4px 8px', fontSize: '0.74rem', height: 32 }}
                >
                  Cancel
                </button>
              </form>
            )}
          </div>

          {/* ── Destination Drive, Folder, & Quota Bar ── */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: '12px 16px',
            marginBottom: 18,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--indigo)' }}>
                  <HardDrive size={15} />
                  <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                    {session?.driveName || drives.find(d => d.id === selectedDriveId)?.name || 'Storage Drive'}
                  </span>
                </div>
                <span style={{ color: 'var(--text-3)' }}>•</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--amber)' }}>
                  <Folder size={15} />
                  <span style={{ color: 'var(--text-2)', fontFamily: 'monospace', fontWeight: 500 }}>
                    {session?.folder || folder}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDriveConfig(!showDriveConfig)}
                className="btn btn-ghost"
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  height: 30,
                  gap: 5,
                  color: showDriveConfig ? 'var(--cyan)' : 'var(--text-2)',
                  background: showDriveConfig ? 'rgba(34,211,238,0.1)' : 'transparent',
                  border: showDriveConfig ? '1px solid rgba(34,211,238,0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
                title="Change destination drive, folder, or upload quota"
              >
                <Settings2 size={13} />
                <span>{showDriveConfig ? 'Close Drive Settings' : 'Drive & Quota'}</span>
              </button>
            </div>

            {/* Expandable Drive / Quota / Folder configuration */}
            {showDriveConfig && (
              <div style={{ paddingTop: 14, marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12
                }}>
                  {/* Target Drive Selector */}
                  {drives.length > 0 && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-3)', marginBottom: 5, fontWeight: 600 }}>
                        <HardDrive size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: 'var(--indigo)' }} />
                        Target Drive
                      </label>
                      <select
                        value={selectedDriveId}
                        onChange={e => handleDriveChange(e.target.value)}
                        className="custom-select custom-select-sm"
                        aria-label="Target storage drive"
                        style={{ width: '100%' }}
                      >
                        {drives.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.name} {d.role ? `[${d.role}]` : ''} ({d.freeGB != null ? `${d.freeGB} GB free` : 'Ready'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Quota Selector */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-3)', marginBottom: 5, fontWeight: 600 }}>
                      <Shield size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: 'var(--emerald)' }} />
                      Session Upload Quota
                    </label>
                    <select
                      value={maxTotalBytes}
                      onChange={e => handleQuotaChange(e.target.value)}
                      className="custom-select custom-select-sm"
                      aria-label="Session upload quota"
                      style={{ width: '100%' }}
                    >
                      {QUOTA_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} Max
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Target Folder Path Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-3)', marginBottom: 5, fontWeight: 600 }}>
                    <Folder size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: 'var(--amber)' }} />
                    Destination Folder Path
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={folder}
                      onChange={e => setFolder(e.target.value)}
                      placeholder="/"
                      className="txt-input"
                      style={{ flex: 1, fontSize: '0.82rem', height: 34, padding: '6px 12px' }}
                    />
                    <button
                      onClick={() => createSession(maxTotalBytes, maxFileBytes, expiryMinutes, selectedDriveId, folder)}
                      disabled={isCreating}
                      className="btn btn-primary"
                      style={{ padding: '6px 14px', fontSize: '0.78rem', height: 34, flexShrink: 0 }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {errorMsg && (
            <div style={{
              padding: '12px 14px',
              background: 'rgba(244,63,94,0.12)',
              border: '1px solid rgba(244,63,94,0.3)',
              borderRadius: 10,
              color: 'var(--rose)',
              fontSize: '0.82rem',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successNotice && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 10,
              color: 'var(--emerald)',
              fontSize: '0.82rem',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              <span>{successNotice}</span>
            </div>
          )}

          {isCreating ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)' }}>
              <RefreshCw size={26} className="spin" style={{ margin: '0 auto 12px', color: 'var(--emerald)' }} />
              <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>Generating secure QuickDrop session…</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-3)', marginTop: 4 }}>Configuring expiry ({expiryMinutes}m) and drive storage</div>
            </div>
          ) : session ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* QR Code Container */}
              <div style={{
                position: 'relative',
                background: '#ffffff',
                padding: 16,
                borderRadius: 20,
                boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
                marginBottom: 16,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <QRCodeSVG
                  value={dropUrl}
                  size={200}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* Instructions */}
              <div style={{
                textAlign: 'center',
                fontSize: '0.84rem',
                color: 'var(--text-2)',
                marginBottom: 16,
                maxWidth: 440,
                lineHeight: 1.5
              }}>
                Scan this QR code with your smartphone camera. You can snap live camera photos or select files from your phone gallery to upload directly. No password needed.
              </div>

              {/* Copy URL & Open Link Box */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '4px 6px 4px 12px',
                marginBottom: 20,
                gap: 6
              }}>
                <input
                  type="text"
                  readOnly
                  value={dropUrl}
                  aria-label="QuickDrop mobile link"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    fontSize: '0.82rem',
                    color: 'var(--text-2)',
                    flex: 1,
                    outline: 'none',
                    fontFamily: 'monospace'
                  }}
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="btn btn-ghost"
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    flexShrink: 0,
                    gap: 5
                  }}
                  title="Copy link to clipboard"
                >
                  {copied ? <Check size={14} color="var(--emerald)" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
                <a
                  href={dropUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost"
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.78rem',
                    flexShrink: 0,
                    gap: 4,
                    color: 'var(--cyan)',
                    textDecoration: 'none'
                  }}
                  title="Open mobile upload page in a new browser tab"
                >
                  <ExternalLink size={14} />
                  <span className="hide-mobile">Open</span>
                </a>
              </div>

              {/* Live Upload Feed */}
              <div style={{ width: '100%' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-1)' }}>
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--emerald)',
                      boxShadow: '0 0 10px var(--emerald)',
                      animation: 'pulse 1.5s infinite'
                    }} />
                    <span>Live Phone Receiver</span>
                  </div>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-3)', fontWeight: 500 }}>
                    {status?.uploadedCount || 0} file(s) received
                  </span>
                </div>

                {status?.uploadedFiles?.length > 0 ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    maxHeight: 150,
                    overflowY: 'auto',
                    paddingRight: 4
                  }}>
                    {status.uploadedFiles.slice().reverse().map((f, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'rgba(16,185,129,0.08)',
                          border: '1px solid rgba(16,185,129,0.22)',
                          borderRadius: 8,
                          padding: '7px 12px',
                          fontSize: '0.8rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <CheckCircle2 size={14} color="var(--emerald)" style={{ flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-1)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: '0.74rem', flexShrink: 0 }}>
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
                    padding: '18px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    fontSize: '0.8rem',
                    color: 'var(--text-3)'
                  }}>
                    Waiting for uploads from smartphone camera or gallery…
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.015)'
        }}>
          <button
            type="button"
            onClick={() => createSession(maxTotalBytes, maxFileBytes, expiryMinutes, selectedDriveId, folder)}
            disabled={isCreating}
            className="btn btn-ghost"
            style={{ fontSize: '0.8rem', padding: '7px 14px', gap: 6 }}
          >
            <RefreshCw size={13} className={isCreating ? 'spin' : ''} />
            <span>Regenerate Session</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (status?.uploadedCount > 0 && onFilesReceived) {
                onFilesReceived();
              }
              onClose();
            }}
            className="btn btn-primary"
            style={{ padding: '7px 22px', fontSize: '0.88rem', fontWeight: 600 }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
