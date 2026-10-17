import React, { useState, useEffect, useRef } from 'react';
import {
  X, DownloadCloud, Play, Pause, Trash2, CheckCircle2, AlertTriangle,
  RefreshCw, HardDrive, ShieldCheck, Copy, Check, FileDown, Clock,
  ChevronDown, ChevronUp, Link as LinkIcon, Folder, Clipboard, CheckCheck
} from 'lucide-react';
import { StorageService } from '../services/api';

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes) || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || isNaN(bytesPerSec) || bytesPerSec === 0) return '0 KB/s';
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatEta(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0 || seconds === Infinity) return '';
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  if (m < 60) return `${m}m ${s}s left`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m left`;
}

export function RemoteDownloadModal({
  isOpen,
  onClose,
  drives = [],
  activeDriveId,
  currentPath = '/',
  onDownloadStarted
}) {
  const [url, setUrl]                       = useState('');
  const [selectedDriveId, setSelectedDriveId] = useState(activeDriveId || (drives[0]?.id || ''));
  const [folder, setFolder]                 = useState(currentPath || '/');
  const [filename, setFilename]             = useState('');
  const [expectedHash, setExpectedHash]     = useState('');
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [errorMsg, setErrorMsg]             = useState('');
  const [successNotice, setSuccessNotice]   = useState('');
  const [downloads, setDownloads]           = useState([]);
  const [copiedHash, setCopiedHash]         = useState(null);
  const [showAdvanced, setShowAdvanced]     = useState(false);
  const pollTimerRef                        = useRef(null);

  // Sync drive and folder defaults when modal opens
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

  // Fetch download list
  const fetchDownloads = async () => {
    try {
      const list = await StorageService.getRemoteDownloads();
      setDownloads(list || []);
    } catch (_) {}
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchDownloads();

    // Poll every 1.5 seconds while open to show real-time progress & speed
    pollTimerRef.current = setInterval(fetchDownloads, 1500);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen]);

  const handlePasteUrl = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText && (clipText.startsWith('http://') || clipText.startsWith('https://'))) {
        setUrl(clipText.trim());
      }
    } catch (_) {
      // Clipboard permissions denied
    }
  };

  const handleStart = async (e) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setErrorMsg('Please enter a valid HTTP or HTTPS file URL.');
      return;
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      setErrorMsg('URL must begin with http:// or https://');
      return;
    }
    setErrorMsg('');
    setSuccessNotice('');
    setIsSubmitting(true);
    try {
      const res = await StorageService.startRemoteDownload({
        url: cleanUrl,
        driveId: selectedDriveId,
        folder: folder.trim() || '/',
        filename: filename.trim() || undefined,
        expectedHash: expectedHash.trim() || undefined
      });
      setUrl('');
      setFilename('');
      setExpectedHash('');
      setShowAdvanced(false);
      setSuccessNotice('Download queued and started on server storage!');
      setTimeout(() => setSuccessNotice(''), 4000);
      await fetchDownloads();
      if (onDownloadStarted) onDownloadStarted(res.download);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to start download task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePause = async (id) => {
    try {
      await StorageService.pauseRemoteDownload(id);
      fetchDownloads();
    } catch (err) {
      alert('Pause failed: ' + err.message);
    }
  };

  const handleResume = async (id) => {
    try {
      await StorageService.resumeRemoteDownload(id);
      fetchDownloads();
    } catch (err) {
      alert('Resume failed: ' + err.message);
    }
  };

  const handleDelete = async (id, deleteFile = false) => {
    if (deleteFile && !window.confirm('Delete this download task and remove the partially downloaded file from disk?')) {
      return;
    }
    try {
      await StorageService.deleteRemoteDownload(id, deleteFile);
      fetchDownloads();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleCopyHash = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  if (!isOpen) return null;

  const isUrlValid = url.startsWith('http://') || url.startsWith('https://');

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="downloader-title"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 740,
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
          padding: '18px 24px',
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
              background: 'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(99,102,241,0.25))',
              border: '1px solid rgba(34,211,238,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan)',
              boxShadow: '0 0 20px rgba(34,211,238,0.2)'
            }}>
              <DownloadCloud size={22} />
            </div>
            <div>
              <div id="downloader-title" style={{ fontSize: '1.08rem', fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Direct-to-Cloud Downloader</span>
                <span style={{
                  fontSize: '0.65rem',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(34,211,238,0.15)',
                  border: '1px solid rgba(34,211,238,0.35)',
                  color: 'var(--cyan)',
                  fontWeight: 700
                }}>
                  Zero Phone Bandwidth
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                Download large files directly to server storage without consuming mobile data
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

        {/* Scrollable Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* New Download Form */}
          <form onSubmit={handleStart} style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: '18px 20px',
            marginBottom: 22,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              fontSize: '0.86rem',
              fontWeight: 700,
              color: 'var(--text-1)',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileDown size={16} color="var(--cyan)" />
                <span>New Remote Download Task</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: '0.74rem', height: 28, gap: 4, color: showAdvanced ? 'var(--cyan)' : 'var(--text-2)' }}
              >
                <span>{showAdvanced ? 'Hide Options' : 'Custom Name / Hash'}</span>
                {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>

            {/* URL Input */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--text-2)', fontWeight: 600 }}>
                  <LinkIcon size={12} color="var(--cyan)" />
                  <span>File Download URL (HTTP or HTTPS)</span>
                </label>
                {typeof navigator !== 'undefined' && navigator.clipboard && (
                  <button
                    type="button"
                    onClick={handlePasteUrl}
                    className="btn btn-ghost"
                    style={{ padding: '2px 8px', fontSize: '0.72rem', height: 24, gap: 4, color: 'var(--cyan)' }}
                    title="Paste URL from clipboard"
                  >
                    <Clipboard size={11} />
                    <span>Paste</span>
                  </button>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="url"
                  required
                  placeholder="https://example.com/file.zip or image/iso URL"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  className="txt-input"
                  style={{
                    width: '100%',
                    fontSize: '0.88rem',
                    paddingRight: url ? 68 : 14,
                    borderColor: isUrlValid ? 'rgba(34,211,238,0.4)' : undefined
                  }}
                />
                <div style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  {isUrlValid && (
                    <span title="Valid URL protocol" style={{ color: 'var(--emerald)', display: 'flex' }}>
                      <CheckCheck size={16} />
                    </span>
                  )}
                  {url && (
                    <button
                      type="button"
                      onClick={() => setUrl('')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-3)',
                        cursor: 'pointer',
                        padding: 4
                      }}
                      title="Clear URL"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Destination Drive and Folder */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
              marginBottom: 14
            }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--text-2)', marginBottom: 6, fontWeight: 600 }}>
                  <HardDrive size={12} color="var(--indigo)" />
                  <span>Target Drive</span>
                </label>
                <select
                  value={selectedDriveId}
                  onChange={e => setSelectedDriveId(e.target.value)}
                  className="custom-select"
                  aria-label="Target download storage drive"
                  style={{ width: '100%' }}
                >
                  {drives.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.role ? `[${d.role}]` : ''} ({d.freeGB != null ? `${d.freeGB} GB free` : 'Ready'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--text-2)', marginBottom: 6, fontWeight: 600 }}>
                  <Folder size={12} color="var(--amber)" />
                  <span>Destination Folder Path</span>
                </label>
                <input
                  type="text"
                  placeholder="/"
                  value={folder}
                  onChange={e => setFolder(e.target.value)}
                  className="txt-input"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Quick Folder Path Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: showAdvanced ? 14 : 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>Suggestions:</span>
              {['/', '/Downloads', '/Media', '/Documents'].map(pathOption => (
                <button
                  key={pathOption}
                  type="button"
                  onClick={() => setFolder(pathOption)}
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.7rem',
                    borderRadius: 6,
                    border: folder === pathOption ? '1px solid var(--amber)' : '1px solid rgba(255,255,255,0.08)',
                    background: folder === pathOption ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.02)',
                    color: folder === pathOption ? 'var(--amber)' : 'var(--text-3)',
                    cursor: 'pointer'
                  }}
                >
                  {pathOption}
                </button>
              ))}
            </div>

            {/* Advanced: Custom Filename & SHA-256 */}
            {showAdvanced && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 14,
                marginBottom: 16,
                padding: '14px 16px',
                background: 'rgba(0,0,0,0.22)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-3)', marginBottom: 5, fontWeight: 600 }}>
                    Custom Filename (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-detect from URL & headers"
                    value={filename}
                    onChange={e => setFilename(e.target.value)}
                    className="txt-input"
                    style={{ width: '100%', fontSize: '0.82rem' }}
                  />
                  <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 4 }}>
                    Leave blank to automatically infer from URL or Content-Type headers
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-3)', marginBottom: 5, fontWeight: 600 }}>
                    Expected SHA-256 (Optional Verification)
                  </label>
                  <input
                    type="text"
                    placeholder="Checksum will be verified automatically"
                    value={expectedHash}
                    onChange={e => setExpectedHash(e.target.value)}
                    className="txt-input"
                    style={{ width: '100%', fontSize: '0.82rem' }}
                  />
                  <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 4 }}>
                    Checksum is automatically calculated and matched upon completion
                  </span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: 'rgba(244,63,94,0.12)',
                border: '1px solid rgba(244,63,94,0.3)',
                borderRadius: 8,
                color: 'var(--rose)',
                fontSize: '0.82rem',
                marginBottom: 14
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successNotice && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: 'rgba(16,185,129,0.12)',
                border: '1px solid rgba(16,185,129,0.3)',
                borderRadius: 8,
                color: 'var(--emerald)',
                fontSize: '0.82rem',
                marginBottom: 14
              }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span>{successNotice}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !url.trim()}
              className="btn btn-primary"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px',
                fontSize: '0.92rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
                border: 'none',
                boxShadow: '0 4px 18px rgba(34,211,238,0.25)'
              }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>Validating &amp; Starting Server Download…</span>
                </>
              ) : (
                <>
                  <DownloadCloud size={16} />
                  <span>Start Server Download</span>
                </>
              )}
            </button>
          </form>

          {/* Active & Past Downloads Section */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Download Queue</span>
              <span style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-2)'
              }}>
                {downloads.length}
              </span>
            </div>
            <button
              type="button"
              onClick={fetchDownloads}
              className="btn btn-ghost"
              style={{ fontSize: '0.76rem', padding: '5px 12px', height: 'auto', gap: 6 }}
              title="Refresh queue"
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>
          </div>

          {downloads.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 18px',
              background: 'rgba(255,255,255,0.015)',
              border: '1px dashed rgba(255,255,255,0.08)',
              borderRadius: 14,
              color: 'var(--text-3)',
              fontSize: '0.84rem'
            }}>
              No active or previous downloads. Paste an HTTP or HTTPS file link above to start downloading.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {downloads.map(dl => {
                const isDownloading = dl.status === 'downloading';
                const isPaused = dl.status === 'paused';
                const isCompleted = dl.status === 'completed';
                const isFailed = dl.status === 'failed';

                let statusBadge = null;
                if (isDownloading) {
                  statusBadge = (
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: 'rgba(34,211,238,0.15)',
                      color: 'var(--cyan)',
                      border: '1px solid rgba(34,211,238,0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', animation: 'pulse 1.5s infinite' }} />
                      Downloading
                    </span>
                  );
                } else if (isPaused) {
                  statusBadge = (
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: 'rgba(245,158,11,0.15)',
                      color: 'var(--amber)',
                      border: '1px solid rgba(245,158,11,0.35)'
                    }}>
                      Paused
                    </span>
                  );
                } else if (isCompleted) {
                  statusBadge = (
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: 'rgba(16,185,129,0.15)',
                      color: 'var(--emerald)',
                      border: '1px solid rgba(16,185,129,0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <CheckCircle2 size={13} />
                      Completed
                    </span>
                  );
                } else {
                  statusBadge = (
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: 'rgba(244,63,94,0.15)',
                      color: 'var(--rose)',
                      border: '1px solid rgba(244,63,94,0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <AlertTriangle size={13} />
                      Failed
                    </span>
                  );
                }

                return (
                  <div
                    key={dl.id}
                    style={{
                      background: 'rgba(255,255,255,0.025)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 14,
                      padding: '16px',
                      position: 'relative',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Header info */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 700,
                          fontSize: '0.92rem',
                          color: 'var(--text-1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginBottom: 4
                        }} title={dl.filename}>
                          {dl.filename}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-2)' }}>
                            <HardDrive size={13} color="var(--indigo)" />
                            {dl.driveName}
                          </span>
                          <span>•</span>
                          <span style={{ fontFamily: 'monospace' }}>{dl.folder}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {statusBadge}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{
                      height: 7,
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.07)',
                      overflow: 'hidden',
                      margin: '10px 0 8px 0'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${dl.percent || (isCompleted ? 100 : 0)}%`,
                        background: isFailed
                          ? 'var(--rose)'
                          : isCompleted
                          ? 'var(--emerald)'
                          : isPaused
                          ? 'var(--amber)'
                          : 'linear-gradient(90deg, #06b6d4, #6366f1)',
                        transition: 'width 0.3s ease',
                        boxShadow: isDownloading ? '0 0 10px rgba(34,211,238,0.5)' : 'none'
                      }} />
                    </div>

                    {/* Meta stats: bytes, speed, eta */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.76rem',
                      color: 'var(--text-3)',
                      marginBottom: 10,
                      flexWrap: 'wrap',
                      gap: 6
                    }}>
                      <div style={{ fontWeight: 500 }}>
                        {formatBytes(dl.downloadedBytes)}
                        {dl.totalBytes > 0 && ` of ${formatBytes(dl.totalBytes)}`}
                        {dl.percent > 0 && ` (${dl.percent}%)`}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {isDownloading && dl.speed > 0 && (
                          <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>
                            {formatSpeed(dl.speed)}
                          </span>
                        )}
                        {isDownloading && dl.eta > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} />
                            {formatEta(dl.eta)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Error message if failed */}
                    {dl.error && (
                      <div style={{
                        fontSize: '0.76rem',
                        color: 'var(--rose)',
                        marginBottom: 10,
                        background: 'rgba(244,63,94,0.09)',
                        border: '1px solid rgba(244,63,94,0.25)',
                        padding: '8px 12px',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                        <span>{dl.error}</span>
                      </div>
                    )}

                    {/* Checksum info if completed */}
                    {dl.sha256 && (
                      <div style={{
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                        color: 'var(--text-3)',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        padding: '7px 12px',
                        borderRadius: 8,
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8
                      }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>SHA-256: </span>
                          <span>{dl.sha256}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {dl.expectedHash && (
                            dl.hashMatched ? (
                              <span style={{ color: 'var(--emerald)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <ShieldCheck size={13} />
                                Match
                              </span>
                            ) : (
                              <span style={{ color: 'var(--rose)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <AlertTriangle size={13} />
                                Mismatch
                              </span>
                            )
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopyHash(dl.sha256)}
                            className="btn-icon"
                            style={{ padding: 4, color: 'var(--text-2)' }}
                            title="Copy SHA-256 hash"
                          >
                            {copiedHash === dl.sha256 ? <Check size={13} color="var(--emerald)" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      {isDownloading && (
                        <button
                          type="button"
                          onClick={() => handlePause(dl.id)}
                          className="btn btn-ghost"
                          style={{ fontSize: '0.76rem', padding: '5px 12px', height: 'auto', gap: 5 }}
                        >
                          <Pause size={13} />
                          <span>Pause</span>
                        </button>
                      )}

                      {isPaused && (
                        <button
                          type="button"
                          onClick={() => handleResume(dl.id)}
                          className="btn btn-ghost"
                          style={{ fontSize: '0.76rem', padding: '5px 12px', height: 'auto', color: 'var(--cyan)', gap: 5 }}
                        >
                          <Play size={13} />
                          <span>Resume</span>
                        </button>
                      )}

                      {isFailed && dl.resumable && (
                        <button
                          type="button"
                          onClick={() => handleResume(dl.id)}
                          className="btn btn-ghost"
                          style={{ fontSize: '0.76rem', padding: '5px 12px', height: 'auto', color: 'var(--cyan)', gap: 5 }}
                        >
                          <RefreshCw size={13} />
                          <span>Retry</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(dl.id, !isCompleted)}
                        className="btn-icon danger"
                        style={{ padding: '6px', borderRadius: 8 }}
                        title={isCompleted ? 'Clear task history' : 'Cancel & delete partial download'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
          <div style={{ fontSize: '0.76rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={14} color="var(--emerald)" />
            <span>SSRF protected • Range resumable • Background daemon</span>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost" style={{ padding: '7px 18px', fontSize: '0.86rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
