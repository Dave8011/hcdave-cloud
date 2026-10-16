import React, { useState, useEffect, useRef } from 'react';
import {
  X, DownloadCloud, Play, Pause, Trash2, CheckCircle2, AlertTriangle,
  RefreshCw, HardDrive, ShieldCheck, Copy, Check, FileDown, Clock
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
  const [downloads, setDownloads]           = useState([]);
  const [copiedHash, setCopiedHash]         = useState(null);
  const pollTimerRef                        = useRef(null);

  // Sync drive and folder defaults when modal opens
  useEffect(() => {
    if (activeDriveId) setSelectedDriveId(activeDriveId);
    if (currentPath) setFolder(currentPath);
  }, [activeDriveId, currentPath, isOpen]);

  // Fetch download list
  const fetchDownloads = async () => {
    try {
      const list = await StorageService.getRemoteDownloads();
      setDownloads(list);
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

  const handleStart = async (e) => {
    e.preventDefault();
    if (!url.trim()) {
      setErrorMsg('Please enter a valid HTTP/HTTPS file URL.');
      return;
    }
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const res = await StorageService.startRemoteDownload({
        url: url.trim(),
        driveId: selectedDriveId,
        folder: folder.trim() || '/',
        filename: filename.trim() || undefined,
        expectedHash: expectedHash.trim() || undefined
      });
      setUrl('');
      setFilename('');
      setExpectedHash('');
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
    if (deleteFile && !window.confirm('Delete this download task and remove the file from storage?')) {
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

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-box"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 720,
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
              background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(99,102,241,0.2))',
              border: '1px solid rgba(34,211,238,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan)'
            }}>
              <DownloadCloud size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-1)' }}>
                Direct-to-Cloud Downloader
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                Download large files directly to your storage server with zero mobile bandwidth
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

        {/* Scrollable Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* New Download Form */}
          <form onSubmit={handleStart} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12,
            padding: 18,
            marginBottom: 24
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileDown size={16} color="var(--cyan)" />
              <span>New Remote Download</span>
            </div>

            {/* URL Input */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-3)', marginBottom: 6, fontWeight: 500 }}>
                File Download URL (HTTP / HTTPS)
              </label>
              <input
                type="url"
                required
                placeholder="https://example.com/files/archive.zip"
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="txt-input"
                style={{ width: '100%', fontSize: '0.88rem' }}
              />
            </div>

            {/* Destination Drive and Folder */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-3)', marginBottom: 6, fontWeight: 500 }}>
                  Target Drive
                </label>
                <select
                  value={selectedDriveId}
                  onChange={e => setSelectedDriveId(e.target.value)}
                  className="txt-input"
                  style={{ width: '100%', fontSize: '0.84rem' }}
                >
                  {drives.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.role || 'Storage'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-3)', marginBottom: 6, fontWeight: 500 }}>
                  Destination Folder Path
                </label>
                <input
                  type="text"
                  placeholder="/"
                  value={folder}
                  onChange={e => setFolder(e.target.value)}
                  className="txt-input"
                  style={{ width: '100%', fontSize: '0.84rem' }}
                />
              </div>
            </div>

            {/* Custom Filename & SHA-256 (Optional) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-3)', marginBottom: 6, fontWeight: 500 }}>
                  Custom Filename (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Auto-detect from URL"
                  value={filename}
                  onChange={e => setFilename(e.target.value)}
                  className="txt-input"
                  style={{ width: '100%', fontSize: '0.84rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-3)', marginBottom: 6, fontWeight: 500 }}>
                  Expected SHA-256 Checksum (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Verify hash integrity upon completion"
                  value={expectedHash}
                  onChange={e => setExpectedHash(e.target.value)}
                  className="txt-input"
                  style={{ width: '100%', fontSize: '0.84rem' }}
                />
              </div>
            </div>

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

            <button
              type="submit"
              disabled={isSubmitting || !url.trim()}
              className="btn btn-primary"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '11px',
                fontSize: '0.9rem',
                fontWeight: 600
              }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>Validating &amp; Starting Download…</span>
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
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-1)' }}>
              Download Queue ({downloads.length})
            </div>
            <button
              onClick={fetchDownloads}
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 10px', height: 'auto' }}
              title="Refresh list"
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>
          </div>

          {downloads.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '36px 16px',
              background: 'rgba(255,255,255,0.015)',
              border: '1px dashed rgba(255,255,255,0.08)',
              borderRadius: 12,
              color: 'var(--text-3)',
              fontSize: '0.82rem'
            }}>
              No active or previous downloads. Paste a URL above to start direct-to-cloud download.
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
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(34,211,238,0.15)',
                      color: 'var(--cyan)',
                      border: '1px solid rgba(34,211,238,0.3)',
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
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(245,158,11,0.15)',
                      color: 'var(--amber)',
                      border: '1px solid rgba(245,158,11,0.3)'
                    }}>
                      Paused
                    </span>
                  );
                } else if (isCompleted) {
                  statusBadge = (
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(16,185,129,0.15)',
                      color: 'var(--emerald)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <CheckCircle2 size={12} />
                      Completed
                    </span>
                  );
                } else {
                  statusBadge = (
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(244,63,94,0.15)',
                      color: 'var(--rose)',
                      border: '1px solid rgba(244,63,94,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <AlertTriangle size={12} />
                      Failed
                    </span>
                  );
                }

                return (
                  <div
                    key={dl.id}
                    style={{
                      background: 'rgba(255,255,255,0.025)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 12,
                      padding: 16,
                      position: 'relative',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Header info */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          color: 'var(--text-1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginBottom: 4
                        }} title={dl.filename}>
                          {dl.filename}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <HardDrive size={13} color="var(--indigo)" />
                            {dl.driveName}
                          </span>
                          <span>•</span>
                          <span>{dl.folder}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {statusBadge}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{
                      height: 6,
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.06)',
                      overflow: 'hidden',
                      margin: '10px 0 8px 0'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${dl.percent || 0}%`,
                        background: isFailed ? 'var(--rose)' : isCompleted ? 'var(--emerald)' : isPaused ? 'var(--amber)' : 'linear-gradient(90deg, var(--cyan), var(--indigo))',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>

                    {/* Meta stats: bytes, speed, eta */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: 'var(--text-3)',
                      marginBottom: 10
                    }}>
                      <div>
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
                        fontSize: '0.75rem',
                        color: 'var(--rose)',
                        marginBottom: 10,
                        background: 'rgba(244,63,94,0.08)',
                        padding: '6px 10px',
                        borderRadius: 6
                      }}>
                        {dl.error}
                      </div>
                    )}

                    {/* Checksum info if completed */}
                    {dl.sha256 && (
                      <div style={{
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                        color: 'var(--text-3)',
                        background: 'rgba(0,0,0,0.25)',
                        padding: '6px 10px',
                        borderRadius: 6,
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
                            onClick={() => handleCopyHash(dl.sha256)}
                            className="btn-icon"
                            style={{ padding: 3, color: 'var(--text-2)' }}
                            title="Copy SHA-256"
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
                          onClick={() => handlePause(dl.id)}
                          className="btn btn-ghost"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', height: 'auto' }}
                        >
                          <Pause size={13} />
                          <span>Pause</span>
                        </button>
                      )}

                      {isPaused && (
                        <button
                          onClick={() => handleResume(dl.id)}
                          className="btn btn-ghost"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', height: 'auto', color: 'var(--cyan)' }}
                        >
                          <Play size={13} />
                          <span>Resume</span>
                        </button>
                      )}

                      {isFailed && dl.resumable && (
                        <button
                          onClick={() => handleResume(dl.id)}
                          className="btn btn-ghost"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', height: 'auto', color: 'var(--cyan)' }}
                        >
                          <RefreshCw size={13} />
                          <span>Retry</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(dl.id, !isCompleted)}
                        className="btn-icon danger"
                        style={{ padding: '6px', borderRadius: 6 }}
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
          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={14} color="var(--emerald)" />
            <span>SSRF protected • HTTP Range resumable</span>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px 16px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
