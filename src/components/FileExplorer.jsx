import React, { useState, useRef, useCallback } from 'react';
import {
  Folder, FileText, Image as Img, Film, Archive,
  Grid3X3, List, ChevronRight, HardDrive, Eye, FolderOpen, Share2, RefreshCw,
  CheckCircle2, Circle, Download, X
} from 'lucide-react';
import { ShareModal } from './ShareModal';
import { StorageService } from '../services/api';

const TYPE_MAP = {
  folder:   { cls: 'folder',   Icon: Folder },
  image:    { cls: 'image',    Icon: Img },
  video:    { cls: 'video',    Icon: Film },
  archive:  { cls: 'archive',  Icon: Archive },
  document: { cls: 'document', Icon: FileText },
};

const LONG_PRESS_MS = 500;

export function FileExplorer({ files, isLoading, activeDrive, currentPath, setCurrentPath, onSelectFile }) {
  const [view, setView] = useState('grid');
  const [shareFile, setShareFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const longPressTimer = useRef(null);
  const didLongPress = useRef(false);

  /* ── Selection helpers ── */
  const enterSelectMode = useCallback((file) => {
    setSelectMode(true);
    setSelectedFiles(new Set([file.path]));
  }, []);

  const toggleSelect = useCallback((file) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file.path)) next.delete(file.path);
      else next.add(file.path);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }, []);

  const clearSelection = () => { setSelectedFiles(new Set()); setSelectMode(false); };

  /* ── Long-press handlers (mobile) ── */
  const onPressStart = useCallback((file) => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      if (!selectMode) {
        enterSelectMode(file);
      }
    }, LONG_PRESS_MS);
  }, [selectMode, enterSelectMode]);

  const onPressEnd = useCallback(() => {
    clearTimeout(longPressTimer.current);
  }, []);

  /* ── Click / tap ── */
  const handleCardClick = useCallback((file) => {
    if (didLongPress.current) { didLongPress.current = false; return; }
    if (selectMode) { toggleSelect(file); return; }
    if (file.type === 'folder') {
      setCurrentPath(currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`);
    } else {
      onSelectFile(file);
    }
  }, [selectMode, toggleSelect, currentPath, setCurrentPath, onSelectFile]);

  const handleDownloadZip = () => {
    if (selectedFiles.size === 0) return;
    StorageService.downloadZip(activeDrive.id, Array.from(selectedFiles));
    clearSelection();
  };

  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);

  return (
    <div>
      {/* Toolbar */}
      <div className="toolbar">
        <div className="breadcrumbs">
          <HardDrive size={16} style={{ color: 'var(--indigo)' }} />
          <span className="bc-root" onClick={() => setCurrentPath('/')}>
            {activeDrive?.name || 'Drive'}
          </span>
          {pathParts.map((part, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={14} className="bc-sep" />
              <span
                className={i === pathParts.length - 1 ? 'bc-current' : 'bc-root'}
                onClick={() => { if (i < pathParts.length - 1) setCurrentPath('/' + pathParts.slice(0, i + 1).join('/')); }}
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

      {/* Loading */}
      {isLoading && (
        <div className="empty-state">
          <div className="empty-icon" style={{ animation: 'spin 1s linear infinite' }}>
            <RefreshCw size={36} color="var(--cyan)" />
          </div>
          <div className="empty-title">Loading...</div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && files.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><FolderOpen size={36} /></div>
          <div className="empty-title">This folder is empty</div>
          <div className="empty-desc">
            {currentPath === '/'
              ? 'Connect a USB drive to your device and it will appear here automatically.'
              : 'No files found in this folder.'}
          </div>
        </div>
      )}

      {/* ── Grid View ── */}
      {!isLoading && files.length > 0 && view === 'grid' && (
        <div className="file-grid">
          {files.map((file) => {
            const { cls, Icon } = TYPE_MAP[file.type] || TYPE_MAP.document;
            const isSelected = selectedFiles.has(file.path);
            return (
              <div
                key={file.id}
                className={`file-card ${isSelected ? 'selected' : ''}`}
                style={{ position: 'relative', userSelect: 'none' }}
                onClick={() => handleCardClick(file)}
                onMouseDown={() => onPressStart(file)}
                onMouseUp={onPressEnd}
                onMouseLeave={onPressEnd}
                onTouchStart={() => onPressStart(file)}
                onTouchEnd={onPressEnd}
              >
                {/* Selection circle badge */}
                {selectMode && (
                  <div className="selection-badge" onClick={(e) => { e.stopPropagation(); toggleSelect(file); }}>
                    {isSelected
                      ? <CheckCircle2 size={22} fill="var(--blue)" color="white" />
                      : <Circle size={22} color="rgba(255,255,255,0.6)" />
                    }
                  </div>
                )}

                <div className="card-top">
                  <div className={`file-icon ${cls}`}>
                    {file.type === 'image' ? (
                      <img
                        src={StorageService.getThumbnailUrl(activeDrive.id, file.path)}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--r-sm)' }}
                        alt={file.name}
                      />
                    ) : (
                      <Icon size={22} />
                    )}
                  </div>
                  {/* Desktop action buttons */}
                  {!selectMode && (
                    <div className="desktop-only" style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="card-action btn-icon"
                        style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)' }}
                        onClick={(e) => { e.stopPropagation(); setShareFile(file); }}
                        title="Share"
                      >
                        <Share2 size={14} />
                      </button>
                      <button
                        className="card-action btn-icon"
                        style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)' }}
                        onClick={(e) => { e.stopPropagation(); onSelectFile(file); }}
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  )}
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

      {/* ── List View ── */}
      {!isLoading && files.length > 0 && view === 'list' && (
        <div className="file-list">
          {files.map((file, i) => {
            const { cls, Icon } = TYPE_MAP[file.type] || TYPE_MAP.document;
            const isSelected = selectedFiles.has(file.path);
            return (
              <div
                key={file.id}
                className={`list-row ${isSelected ? 'selected' : ''}`}
                style={{ animationDelay: `${i * 0.04}s`, userSelect: 'none' }}
                onClick={() => handleCardClick(file)}
                onMouseDown={() => onPressStart(file)}
                onMouseUp={onPressEnd}
                onMouseLeave={onPressEnd}
                onTouchStart={() => onPressStart(file)}
                onTouchEnd={onPressEnd}
              >
                {/* Selection circle */}
                {selectMode && (
                  <div className="list-sel-circle" onClick={(e) => { e.stopPropagation(); toggleSelect(file); }}>
                    {isSelected
                      ? <CheckCircle2 size={20} fill="var(--blue)" color="white" />
                      : <Circle size={20} color="rgba(255,255,255,0.4)" />
                    }
                  </div>
                )}

                <div className={`file-icon ${cls}`} style={{ width: 32, height: 32, overflow: 'hidden', flexShrink: 0 }}>
                  {file.type === 'image' ? (
                    <img
                      src={StorageService.getThumbnailUrl(activeDrive.id, file.path)}
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                      alt={file.name}
                    />
                  ) : (
                    <Icon size={17} />
                  )}
                </div>

                <div className="list-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name}
                </div>
                <div className="list-meta" style={{ flexShrink: 0 }}>{file.modified}</div>
                <div className="list-meta" style={{ flexShrink: 0 }}>{file.size}</div>

                {!selectMode && (
                  <div className="list-actions desktop-only" onClick={(e) => e.stopPropagation()}>
                    <button
                      style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', marginRight: 4 }}
                      onClick={(e) => { e.stopPropagation(); setShareFile(file); }}
                      title="Share"
                    >
                      <Share2 size={14} />
                    </button>
                    <button
                      style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
                      onClick={(e) => { e.stopPropagation(); onSelectFile(file); }}
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {shareFile && (
        <ShareModal
          file={shareFile}
          driveId={activeDrive.id}
          onClose={() => setShareFile(null)}
        />
      )}

      {/* ── Floating Action Bar (only in select mode) ── */}
      {selectMode && (
        <div className="floating-action-bar">
          <button className="fab-clear" onClick={clearSelection} title="Exit selection">
            <X size={18} />
          </button>
          <span className="fab-count">{selectedFiles.size} selected</span>
          <button
            className="fab-download"
            onClick={handleDownloadZip}
            disabled={selectedFiles.size === 0}
          >
            <Download size={16} />
            Download Zip
          </button>
        </div>
      )}
    </div>
  );
}
