import React, { useState } from 'react';
import { X, UploadCloud, CheckCircle2 } from 'lucide-react';
import { StorageService } from '../services/api';

export function UploadModal({ activeDrive, onClose, onUploadComplete }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !activeDrive) return;
    setUploading(true);
    setProgress(0);

    try {
      await StorageService.uploadFile(activeDrive.id, selectedFile, '/', (p) => {
        setProgress(p);
      });
      setUploading(false);
      setCompleted(true);
      setTimeout(() => {
        onUploadComplete();
        onClose();
      }, 1200);
    } catch (err) {
      alert('Upload failed: ' + err.message);
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Upload to {activeDrive?.name || 'Drive'}</div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {!completed ? (
          <div>
            <label className="drop-zone">
              <input type="file" onChange={handleFileChange} style={{ display: 'none' }} />
              <UploadCloud size={44} color="var(--accent-primary)" style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {selectedFile ? selectedFile.name : 'Click to select or drag & drop files here'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Photos, Videos, ISOs, Documents'}
              </div>
            </label>

            {uploading && (
              <div style={{ margin: '16px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6 }}>
                  <span>Uploading to {activeDrive?.name}...</span>
                  <span>{progress}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={!selectedFile || uploading}>
                {uploading ? 'Uploading...' : 'Start Upload'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '30px', textAlign: 'center' }}>
            <CheckCircle2 size={56} color="var(--accent-emerald)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Upload Complete!</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              Saved to {activeDrive?.name}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
