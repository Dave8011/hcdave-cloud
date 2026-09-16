import React, { useState, useRef } from 'react';
import { X, UploadCloud, CheckCircle2, File as FileIcon } from 'lucide-react';
import { StorageService } from '../services/api';

export function UploadModal({ activeDrive, currentPath, onClose, onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const addFiles = (incoming) => {
    const arr = Array.from(incoming);
    setFiles((prev) => [...prev, ...arr]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (!files.length || !activeDrive) return;
    setUploading(true);
    setProgress(0);

    // Upload files sequentially with cumulative progress
    for (let i = 0; i < files.length; i++) {
      await StorageService.uploadFile(
        activeDrive.id,
        files[i],
        currentPath || '/',
        (p) => {
          const overall = Math.round(((i + p / 100) / files.length) * 100);
          setProgress(overall);
        }
      );
    }

    setUploading(false);
    setDone(true);
    setTimeout(() => {
      onUploadComplete();
      onClose();
    }, 1400);
  };

  return (
    <div className="modal-overlay" onClick={!uploading ? onClose : undefined}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <div className="modal-title">
            Upload to {activeDrive?.name || 'Drive'}
          </div>
          {!uploading && (
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {done ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <CheckCircle2 size={56} color="var(--emerald)" style={{ marginBottom: 14 }} />
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
              {files.length} file{files.length > 1 ? 's' : ''} uploaded!
            </div>
            <div style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginTop: 4 }}>
              Saved to {activeDrive?.name}
            </div>
          </div>
        ) : (
          <>
            {/* Drop Zone */}
            <div
              className={`drop-zone ${dragging ? 'drag-over' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => addFiles(e.target.files)}
              />
              <UploadCloud size={40} color="var(--indigo)" style={{ marginBottom: 10 }} />
              <div className="drop-title">
                {files.length ? `${files.length} file(s) selected` : 'Click or drag & drop files here'}
              </div>
              <div className="drop-sub">
                Photos, videos, documents, ISOs — any file type
              </div>
            </div>

            {/* File list */}
            {files.length > 0 && !uploading && (
              <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', padding: '6px 10px', background: 'var(--bg-card)', borderRadius: 'var(--r-xs)' }}>
                    <FileIcon size={14} color="var(--text-3)" />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{(f.size / (1024 * 1024)).toFixed(1)} MB</span>
                  </div>
                ))}
              </div>
            )}

            {/* Progress */}
            {uploading && (
              <div className="upload-progress">
                <div className="upload-progress-label">
                  <span>Uploading {files.length} file{files.length > 1 ? 's' : ''}…</span>
                  <span>{progress}%</span>
                </div>
                <div className="prog-bg">
                  <div className="prog-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={onClose} disabled={uploading}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!files.length || uploading}
              >
                {uploading ? <div className="spinner" /> : <UploadCloud size={16} />}
                <span>{uploading ? 'Uploading…' : 'Upload All'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
