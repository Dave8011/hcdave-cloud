import React, { useState } from 'react';
import {
  Folder, FileText, Image as Img, Film, Archive,
  Grid3X3, List, ChevronRight, HardDrive, Eye, FolderOpen
} from 'lucide-react';

const TYPE_MAP = {
  folder:   { cls: 'folder',   Icon: Folder },
  image:    { cls: 'image',    Icon: Img },
  video:    { cls: 'video',    Icon: Film },
  archive:  { cls: 'archive',  Icon: Archive },
  document: { cls: 'document', Icon: FileText },
};

export function FileExplorer({ files, activeDrive, currentPath, setCurrentPath, onSelectFile }) {
  const [view, setView] = useState('grid');

  const navigate = (file) => {
    if (file.type === 'folder') {
      setCurrentPath(currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`);
    } else {
      onSelectFile(file);
    }
  };

  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);

  return (
    <div>
      {/* Toolbar */}
      <div className="toolbar">
        <div className="breadcrumbs">
          <HardDrive size={16} style={{ color: 'var(--indigo)' }} />
          <span
            className="bc-root"
            onClick={() => setCurrentPath('/')}
          >
            {activeDrive?.name || 'Drive'}
          </span>
          {pathParts.map((part, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={14} className="bc-sep" />
              <span
                className={i === pathParts.length - 1 ? 'bc-current' : 'bc-root'}
                onClick={() => {
                  if (i < pathParts.length - 1) {
                    setCurrentPath('/' + pathParts.slice(0, i + 1).join('/'));
                  }
                }}
              >
                {part}
              </span>
            </React.Fragment>
          ))}
        </div>

        <div className="view-toggle">
          <button className={`view-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')}>
            <Grid3X3 size={15} />
          </button>
          <button className={`view-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
            <List size={15} />
          </button>
        </div>
      </div>

      {/* Empty state */}
      {files.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <FolderOpen size={36} />
          </div>
          <div className="empty-title">This folder is empty</div>
          <div className="empty-desc">
            {currentPath === '/'
              ? 'Connect a USB drive to your device and it will appear here automatically.'
              : 'No files found in this folder. Upload some files to get started.'}
          </div>
        </div>
      )}

      {/* Grid View */}
      {files.length > 0 && view === 'grid' && (
        <div className="file-grid">
          {files.map((file) => {
            const { cls, Icon } = TYPE_MAP[file.type] || TYPE_MAP.document;
            return (
              <div key={file.id} className="file-card" onClick={() => navigate(file)}>
                <div className="card-top">
                  <div className={`file-icon ${cls}`}>
                    <Icon size={22} />
                  </div>
                  <button
                    className="card-action btn-icon"
                    style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
                    onClick={(e) => { e.stopPropagation(); onSelectFile(file); }}
                  >
                    <Eye size={14} />
                  </button>
                </div>

                <div className="card-bottom">
                  <div className="card-name" title={file.name}>{file.name}</div>
                  <div className="card-meta">
                    <span>{file.type === 'folder' && file.items ? `${file.items} items` : file.size}</span>
                    <span>{file.modified}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {files.length > 0 && view === 'list' && (
        <div className="file-list">
          {files.map((file, i) => {
            const { cls, Icon } = TYPE_MAP[file.type] || TYPE_MAP.document;
            return (
              <div
                key={file.id}
                className="list-row"
                style={{ animationDelay: `${i * 0.04}s` }}
                onClick={() => navigate(file)}
              >
                <div className={`file-icon ${cls}`} style={{ width: 32, height: 32 }}>
                  <Icon size={17} />
                </div>
                <div className="list-name">{file.name}</div>
                <div className="list-meta">{file.modified}</div>
                <div className="list-meta">{file.size}</div>
                <div className="list-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
                    onClick={() => onSelectFile(file)}
                  >
                    <Eye size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
