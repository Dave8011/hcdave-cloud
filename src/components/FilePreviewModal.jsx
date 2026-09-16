import React, { useState } from 'react';
import { X, Download, Film, Image as Img, FileText, Archive, Folder } from 'lucide-react';
import { StorageService } from '../services/api';

const ICON_MAP = {
  image:    { Icon: Img,      color: 'var(--cyan)' },
  video:    { Icon: Film,     color: 'var(--rose)' },
  archive:  { Icon: Archive,  color: 'var(--emerald)' },
  folder:   { Icon: Folder,   color: 'var(--amber)' },
  document: { Icon: FileText, color: 'var(--indigo)' },
};

export function FilePreviewModal({ file, driveId, onClose }) {
  const [downloading, setDownloading] = useState(false);
  if (!file) return null;

  const { Icon, color } = ICON_MAP[file.type] || ICON_MAP.document;

  const handleDownload = async () => {
    if (file.type === 'image' || file.type === 'video') {
      // stream via secure fetch
      setDownloading(true);
      try {
        await StorageService.downloadFile(driveId, file.path || file.name, file.name);
      } catch (e) {
        alert('Download failed: ' + e.message);
      } finally {
        setDownloading(false);
      }
    }
  };

  const streamUrl = file.streamUrl || null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 700 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon size={20} color={color} />
            <span className="modal-title" style={{ fontSize: '1rem' }}>
              {file.name}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Preview Body */}
        <div className="preview-media-wrap">
          {file.type === 'image' && streamUrl && (
            <img src={streamUrl} alt={file.name} className="preview-img" />
          )}

          {file.type === 'video' && streamUrl && (
            <video controls autoPlay className="preview-video">
              <source src={streamUrl} type="video/mp4" />
            </video>
          )}

          {(file.type !== 'image' && file.type !== 'video') && (
            <div className="preview-fallback">
              <Icon size={56} color={color} style={{ opacity: 0.5, marginBottom: 12 }} />
              <div style={{ fontWeight: 600 }}>{file.name}</div>
              <div style={{ fontSize: '0.82rem', marginTop: 4, color: 'var(--text-3)' }}>
                {file.size} · Modified {file.modified}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download size={16} />
            <span>{downloading ? 'Downloading…' : `Download (${file.size})`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
