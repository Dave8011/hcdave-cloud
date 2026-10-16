import React, { useState, useEffect, useRef } from 'react';
import {
  Camera, UploadCloud, File, CheckCircle2, AlertTriangle, Clock,
  HardDrive, Folder, X, RefreshCw, Smartphone, ChevronRight
} from 'lucide-react';
import { StorageService } from '../services/api';

function formatSize(bytes) {
  if (bytes == null || isNaN(bytes) || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

export function QuickDropPage({ token, onGoHome }) {
  const [session, setSession]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadedFilesList, setUploadedFilesList] = useState([]);
  const [timeLeft, setTimeLeft]       = useState('');

  const cameraInputRef = useRef(null);
  const fileInputRef   = useRef(null);

  // Validate session on mount
  useEffect(() => {
    StorageService.getQuickDrop(token)
      .then(data => {
        setSession(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'QuickDrop link expired or invalid');
        setLoading(false);
      });
  }, [token]);

  // Expiry countdown timer
  useEffect(() => {
    if (!session?.expiresAt) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = session.expiresAt - now;
      if (diff <= 0) {
        setTimeLeft('Expired');
        setError('This QuickDrop link has expired.');
        return;
      }
      const mins = Math.floor(diff / (60 * 1000));
      const secs = Math.floor((diff % (60 * 1000)) / 1000);
      setTimeLeft(`${mins}m ${secs}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [session]);

  const handleFilesAdded = (incomingList) => {
    const arr = Array.from(incomingList);
    setSelectedFiles(prev => [...prev, ...arr]);
    setUploadSuccess(false);
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!selectedFiles.length || uploading) return;
    const batchTotalBytes = selectedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    setUploading(true);
    setUploadProgress(0);
    setError(null);

    if (session?.maxFileBytes && selectedFiles.some(f => f.size > session.maxFileBytes)) {
      setError(`One or more files exceed the max file size limit of ${formatSize(session.maxFileBytes)}`);
      setUploading(false);
      return;
    }
    const remainingQuota = session?.maxTotalBytes ? (session.maxTotalBytes - (session.uploadedBytes || 0)) : null;
    if (remainingQuota !== null && batchTotalBytes > remainingQuota) {
      setError(`Selected files (${formatSize(batchTotalBytes)}) exceed remaining session quota of ${formatSize(remainingQuota)}`);
      setUploading(false);
      return;
    }

    try {
      const result = await StorageService.uploadQuickDropFiles(token, selectedFiles, (progress) => {
        setUploadProgress(progress.percent);
      });
      setUploadSuccess(true);
      setUploadedFilesList(selectedFiles.map(f => ({ name: f.name, size: formatSize(f.size) })));
      setSelectedFiles([]);
      setSession(prev => prev ? {
        ...prev,
        uploadedCount: result.uploadedCount ?? (prev.uploadedCount + selectedFiles.length),
        uploadedBytes: result.uploadedBytes ?? ((prev.uploadedBytes || 0) + batchTotalBytes)
      } : prev);
    } catch (err) {
      setError(err.message || 'Upload failed. Please check network connection.');
    } finally {
      setUploading(false);
    }
  };

  const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px' }}>
          <div className="spinner" style={{ marginBottom: 16 }} />
          <div style={{ color: 'var(--text-3)', fontSize: '0.88rem' }}>Connecting to HC Cloud QuickDrop…</div>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center', padding: '36px 24px', maxWidth: 420 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(244,63,94,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'var(--rose)'
          }}>
            <AlertTriangle size={26} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
            QuickDrop Unavailable
          </h2>
          <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginBottom: 24, lineHeight: 1.5 }}>
            {error}
          </p>
          {onGoHome && (
            <button onClick={onGoHome} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
              Back to Home
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-page" style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <div className="login-card" style={{
        maxWidth: 480,
        width: '100%',
        padding: '24px 20px',
        borderRadius: 16,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(34,211,238,0.2))',
              border: '1px solid rgba(16,185,129,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--emerald)'
            }}>
              <Smartphone size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-1)' }}>
                QuickDrop Transfer
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--emerald)' }} />
                <span>Connected to HC Cloud</span>
              </div>
            </div>
          </div>

          {timeLeft && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.75rem',
              color: 'var(--text-3)',
              background: 'rgba(255,255,255,0.04)',
              padding: '4px 8px',
              borderRadius: 6
            }}>
              <Clock size={13} color="var(--amber)" />
              <span>{timeLeft}</span>
            </div>
          )}
        </div>

        {/* Destination Banner */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: '0.8rem'
        }}>
          <HardDrive size={15} color="var(--indigo)" />
          <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{session?.driveName}</span>
          <span style={{ color: 'var(--text-3)' }}>/</span>
          <Folder size={15} color="var(--amber)" />
          <span style={{ color: 'var(--text-2)', fontFamily: 'monospace' }}>{session?.folder}</span>
          {session?.maxTotalBytes && (
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-3)' }}>
              Quota: {formatSize(Math.max(0, session.maxTotalBytes - (session.uploadedBytes || 0)))}
            </span>
          )}
        </div>

        {/* Action Triggers: Camera + File Browse */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {/* Camera Button */}
          <input
            type="file"
            ref={cameraInputRef}
            accept="image/*,video/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files) handleFilesAdded(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="btn"
            style={{
              flexDirection: 'column',
              padding: '18px 12px',
              gap: 8,
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.25)',
              borderRadius: 12,
              color: 'var(--cyan)',
              cursor: 'pointer',
              height: 'auto'
            }}
          >
            <Camera size={26} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Snap Photo/Video</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>Instant Camera</span>
          </button>

          {/* Browse Files Button */}
          <input
            type="file"
            multiple
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files) handleFilesAdded(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn"
            style={{
              flexDirection: 'column',
              padding: '18px 12px',
              gap: 8,
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 12,
              color: 'var(--indigo)',
              cursor: 'pointer',
              height: 'auto'
            }}
          >
            <UploadCloud size={26} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Choose Files</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>Gallery &amp; Docs</span>
          </button>
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-2)'
            }}>
              <span>Selected for Upload ({selectedFiles.length})</span>
              <span>{formatSize(totalBytes)}</span>
            </div>

            <div style={{
              maxHeight: 180,
              overflowY: 'auto',
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8,
              padding: '6px'
            }}>
              {selectedFiles.map((file, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)',
                    marginBottom: 4,
                    fontSize: '0.78rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <File size={14} color="var(--cyan)" style={{ flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>{formatSize(file.size)}</span>
                    <button
                      onClick={() => handleRemoveFile(idx)}
                      disabled={uploading}
                      className="btn-icon"
                      style={{ padding: 2, color: 'var(--text-3)' }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Progress Bar */}
        {uploading && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-2)', marginBottom: 6 }}>
              <span>Uploading to HC Cloud…</span>
              <span style={{ fontWeight: 700, color: 'var(--cyan)' }}>{uploadProgress}%</span>
            </div>
            <div style={{
              height: 8,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${uploadProgress}%`,
                background: 'linear-gradient(90deg, var(--cyan), var(--emerald))',
                transition: 'width 0.2s ease'
              }} />
            </div>
          </div>
        )}

        {/* Error notification if upload failed */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: 'rgba(244,63,94,0.12)',
            border: '1px solid rgba(244,63,94,0.3)',
            borderRadius: 8,
            color: 'var(--rose)',
            fontSize: '0.8rem',
            marginBottom: 16
          }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Success State */}
        {uploadSuccess && (
          <div style={{
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 10,
            padding: '14px',
            marginBottom: 20,
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--emerald)', fontWeight: 700, marginBottom: 4 }}>
              <CheckCircle2 size={18} />
              <span>Uploaded Successfully!</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
              {uploadedFilesList.length} item(s) safely saved onto {session?.driveName}
            </div>
          </div>
        )}

        {/* Main Action Button */}
        {selectedFiles.length > 0 && !uploadSuccess && (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="btn btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '14px',
              fontSize: '0.95rem',
              fontWeight: 700,
              gap: 8
            }}
          >
            {uploading ? (
              <>
                <RefreshCw size={18} className="spin" />
                <span>Uploading ({uploadProgress}%)…</span>
              </>
            ) : (
              <>
                <UploadCloud size={18} />
                <span>Upload {selectedFiles.length} File(s) Now</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
