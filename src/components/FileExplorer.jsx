import React, { useState } from 'react';
import { 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  Archive, 
  Download, 
  Eye, 
  Trash2, 
  Grid, 
  List, 
  ChevronRight,
  HardDrive
} from 'lucide-react';

export function FileExplorer({ files, activeDrive, currentPath, setCurrentPath, onSelectFile, onDeleteFile }) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  const getFileIcon = (file) => {
    switch (file.type) {
      case 'folder':
        return <Folder size={24} />;
      case 'image':
        return <ImageIcon size={24} />;
      case 'video':
        return <Film size={24} />;
      case 'archive':
        return <Archive size={24} />;
      default:
        return <FileText size={24} />;
    }
  };

  const getFileIconClass = (file) => {
    switch (file.type) {
      case 'folder': return 'folder';
      case 'image': return 'image';
      case 'video': return 'video';
      case 'archive': return 'archive';
      default: return 'document';
    }
  };

  return (
    <div>
      {/* Toolbar & Breadcrumbs */}
      <div className="toolbar">
        <div className="breadcrumbs">
          <HardDrive size={18} style={{ color: 'var(--accent-primary)' }} />
          <span className="breadcrumb-item" onClick={() => setCurrentPath('/')}>
            {activeDrive === 'hdd' ? '2TB HDD' : '512GB SSD'}
          </span>
          {currentPath !== '/' && (
            <>
              <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
              <span className="breadcrumb-item active">{currentPath}</span>
            </>
          )}
        </div>

        {/* Grid vs List View Toggle */}
        <div className="view-options">
          <button 
            className={`icon-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid View"
          >
            <Grid size={18} />
          </button>
          <button 
            className={`icon-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List View"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="file-grid">
          {files.map((file) => (
            <div 
              key={file.id} 
              className="file-card"
              onClick={() => {
                if (file.type === 'folder') {
                  setCurrentPath(`${currentPath === '/' ? '' : currentPath}/${file.name}`);
                } else {
                  onSelectFile(file);
                }
              }}
            >
              <div className="file-card-top">
                <div className={`file-icon-box ${getFileIconClass(file)}`}>
                  {getFileIcon(file)}
                </div>
                <div className="file-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn" onClick={() => onSelectFile(file)} title="Preview / Action">
                    <Eye size={16} />
                  </button>
                </div>
              </div>

              <div>
                <div className="file-title" title={file.name}>{file.name}</div>
                <div className="file-info">
                  <span>{file.size || (file.items ? `${file.items} items` : 'Folder')}</span>
                  <span>{file.modified}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="file-list">
          {files.map((file) => (
            <div 
              key={file.id} 
              className="file-list-row"
              onClick={() => {
                if (file.type === 'folder') {
                  setCurrentPath(`${currentPath === '/' ? '' : currentPath}/${file.name}`);
                } else {
                  onSelectFile(file);
                }
              }}
            >
              <div className={`file-icon-box ${getFileIconClass(file)}`} style={{ width: 32, height: 32 }}>
                {getFileIcon(file)}
              </div>
              <div className="file-title">{file.name}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{file.modified}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {file.size || `${file.items} items`}
              </div>
              <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn" onClick={() => onSelectFile(file)}>
                  <Eye size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
