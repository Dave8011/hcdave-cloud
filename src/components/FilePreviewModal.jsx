import React from 'react';
import { X, Download, Film, Image as ImageIcon, FileText } from 'lucide-react';

export function FilePreviewModal({ file, onClose }) {
  if (!file) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {file.type === 'image' && <ImageIcon color="var(--accent-cyan)" />}
            {file.type === 'video' && <Film color="var(--accent-rose)" />}
            {file.type !== 'image' && file.type !== 'video' && <FileText color="var(--accent-primary)" />}
            <div className="modal-title" style={{ fontSize: '1.05rem' }}>{file.name}</div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content Viewer Body */}
        <div style={{ margin: '20px 0', minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', overflow: 'hidden' }}>
          {file.type === 'image' && (
            <img 
              src={file.url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200'} 
              alt={file.name} 
              style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain' }} 
            />
          )}

          {file.type === 'video' && (
            <video controls autoPlay style={{ width: '100%', maxHeight: '400px' }}>
              <source src={file.url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          )}

          {file.type !== 'image' && file.type !== 'video' && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <FileText size={56} style={{ marginBottom: 12, opacity: 0.5 }} />
              <div>File Preview for <strong>{file.name}</strong></div>
              <div style={{ fontSize: '0.82rem', marginTop: 6, color: 'var(--text-muted)' }}>
                Size: {file.size} • Modified: {file.modified}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <a 
            href={file.url || '#'} 
            download={file.name} 
            target="_blank" 
            rel="noreferrer"
            className="btn btn-primary"
            style={{ textDecoration: 'none' }}
          >
            <Download size={18} />
            <span>Download ({file.size})</span>
          </a>
        </div>
      </div>
    </div>
  );
}
