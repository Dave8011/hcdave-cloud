import React, { useState } from 'react';
import { X, Download, Film, Image as Img, FileText, Archive, Folder, Loader, AlertCircle } from 'lucide-react';
import { StorageService } from '../services/api';

const ICON_MAP = {
  image:    { Icon: Img,      color: 'var(--cyan)' },
  video:    { Icon: Film,     color: 'var(--rose)' },
  archive:  { Icon: Archive,  color: 'var(--emerald)' },
  folder:   { Icon: Folder,   color: 'var(--amber)' },
  document: { Icon: FileText, color: 'var(--indigo)' },
};

function ImagePreview({ src, alt }) {
  const [status, setStatus] = useState('loading'); // loading | loaded | error

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {status === 'loading' && (
        <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text-3)' }}>
          <Loader size={32} style={{ animation: 'spin 1s linear infinite' }} color="var(--cyan)" />
          <span style={{ fontSize: '0.8rem' }}>Processing image…</span>
        </div>
      )}
      {status === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--text-3)', padding: 24 }}>
          <AlertCircle size={36} color="var(--rose)" />
          <span style={{ fontSize: '0.85rem', textAlign: 'center' }}>
            Preview unavailable — image may be too large or <code>sharp</code> is not yet installed on the server.
            <br />Try downloading the file instead.
          </span>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className="preview-img"
        style={{ display: status === 'loaded' ? 'block' : 'none' }}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </div>
  );
}

export function FilePreviewModal({ file, driveId, onClose }) {
  if (!file) return null;

  const { Icon, color } = ICON_MAP[file.type] || ICON_MAP.document;

  const handleDownload = () => {
    StorageService.downloadFile(driveId, file.path || file.name, file.name);
  };

  const streamUrl  = file.type === 'video'
    ? StorageService.getStreamUrl(driveId, file.path || file.name)
    : null;
  const previewUrl = file.type === 'image'
    ? StorageService.getPreviewUrl(driveId, file.path || file.name)
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 720 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Icon size={20} color={color} style={{ flexShrink: 0 }} />
            <span
              className="modal-title"
              style={{ fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={file.name}
            >
              {file.name}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex', flexShrink: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Preview Body */}
        <div className="preview-media-wrap">
          {file.type === 'image' && previewUrl && (
            <ImagePreview src={previewUrl} alt={file.name} />
          )}

          {file.type === 'video' && streamUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center' }}>
              <video controls autoPlay className="preview-video" style={{ maxHeight: '70vh' }}>
                <source src={streamUrl} />
              </video>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', textAlign: 'center', marginTop: 8, paddingBottom: 4 }}>
                Tip: If video stutters, the codec may be incompatible with your browser.
              </div>
            </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{file.size}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={handleDownload}>
              <Download size={16} />
              <span>Download</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
