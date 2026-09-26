import React, { useState, useRef, useCallback } from 'react';
import {
  Folder, FileText, Image as Img, Film, Archive,
  Grid3X3, List, ChevronRight, HardDrive, Eye, FolderOpen, Share2, RefreshCw,
  CheckCircle2, Circle, Download, X, Trash2, CheckSquare, AlertTriangle
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

export function FileExplorer({ files = [], isLoading, activeDrive, currentPath, setCurrentPath, onSelectFile, onRefresh }) {
  const [view, setView] = useState('grid');
  const [shareFiles, setShareFiles] = useState(null); // array of file objects or single file object
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState(null); // { paths: string[], names: string[] }
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const longPressTimer = useRef(null);
  const didLongPress = useRef(false);

  /* ── Selection helpers ── */
  const enterSelectMode = useCallback((file) => {
    setSelectMode(true);
    setSelectedFiles(new Set([file.path]));
  }, []);

  const toggleSelectMode = useCallback(() => {
    if (selectMode) {
      setSelectMode(false);
      setSelectedFiles(new Set());
    } else {
      setSelectMode(true);
    }
  }, [selectMode]);

  const toggleSelect = useCallback((file) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file.path)) next.delete(file.path);
      else next.add(file.path);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!files || files.length === 0) return;
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.path)));
      setSelectMode(true);
    }
  }, [files, selectedFiles.size]);

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

  /* ── Batch / Single Actions ── */
  const handleDownloadZip = () => {
    if (selectedFiles.size === 0) return;
    StorageService.downloadZip(activeDrive.id, Array.from(selectedFiles));
    clearSelection();
  };

  const handleShareSelected = () => {
    if (selectedFiles.size === 0) return;
    const selectedList = files.filter(f => selectedFiles.has(f.path));
    setShareFiles(selectedList.length > 0 ? selectedList : Array.from(selectedFiles).map(p => ({ path: p, name: p.split('/').pop() })));
  };

  const promptDeleteSelected = () => {
    if (selectedFiles.size === 0) return;
    const selectedList = files.filter(f => selectedFiles.has(f.path));
    const paths = Array.from(selectedFiles);
    const names = selectedList.length > 0 ? selectedList.map(f => f.name) : paths.map(p => p.split('/').pop());
    setDeleteModal({ paths, names });
    setDeleteError(null);
  };

  const promptSingleDelete = (file, e) => {
    if (e) e.stopPropagation();
    setDeleteModal({ paths: [file.path], names: [file.name] });
    setDeleteError(null);
  };

  const executeDelete = async () => {
    if (!deleteModal || !deleteModal.paths || deleteModal.paths.length === 0) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await StorageService.deleteFiles(activeDrive.id, deleteModal.paths);
      setDeleteModal(null);
      clearSelection();
      if (onRefresh) onRefresh();
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete file(s)');
    } finally {
      setIsDeleting(false);
    }
  };

  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);
  const allSelected = files.length > 0 && selectedFiles.size === files.length;

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
          <button
            className={`view-btn ${selectMode ? 'active' : ''}`}
            onClick={toggleSelectMode}
            title={selectMode ? "Exit Select Mode" : "Select Files"}
          >
            <CheckSquare size={15} />
          </button>
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
                key={file.id || file.path}
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
                    <div className="desktop-only" style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="card-action btn-icon"
                        style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)' }}
                        onClick={(e) => { e.stopPropagation(); setShareFiles([file]); }}
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
                      <button
                        className="card-action btn-icon btn-delete"
                        style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)' }}
                        onClick={(e) => promptSingleDelete(file, e)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
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
                key={file.id || file.path}
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
                  <div className="list-actions desktop-only" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
                    <button
                      style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
                      onClick={(e) => { e.stopPropagation(); setShareFiles([file]); }}
                      title="Share"
                    >
                      <Share2 size={14} />
                    </button>
                    <button
                      style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
                      onClick={(e) => { e.stopPropagation(); onSelectFile(file); }}
                      title="Preview"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      className="btn-delete"
                      style={{ padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
                      onClick={(e) => promptSingleDelete(file, e)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Single / Multi Share Modal ── */}
      {shareFiles && (
        <ShareModal
          files={shareFiles}
          driveId={activeDrive.id}
          onClose={() => setShareFiles(null)}
        />
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeleteModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-title-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={22} color="var(--rose)" />
                <span className="modal-title" style={{ color: 'var(--rose)' }}>
                  Delete {deleteModal.names.length > 1 ? `${deleteModal.names.length} Items` : 'Item'}?
                </span>
              </div>
              <button
                onClick={() => !isDeleting && setDeleteModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-2)', margin: '12px 0 16px 0', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete the following item(s) from drive <strong>{activeDrive?.name}</strong>? This action cannot be undone.
            </p>

            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              padding: '10px 14px',
              maxHeight: 140,
              overflowY: 'auto',
              fontSize: '0.82rem',
              color: 'var(--text-1)',
              marginBottom: 16
            }}>
              {deleteModal.names.slice(0, 8).map((name, idx) => (
                <div key={idx} style={{ padding: '3px 0', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--text-3)' }}>•</span> {name}
                </div>
              ))}
              {deleteModal.names.length > 8 && (
                <div style={{ fontStyle: 'italic', color: 'var(--text-3)', paddingTop: 4 }}>
                  ...and {deleteModal.names.length - 8} more
                </div>
              )}
            </div>

            {deleteError && (
              <div style={{ padding: 10, background: 'rgba(239,68,68,0.12)', color: 'var(--rose)', borderRadius: 'var(--r-sm)', fontSize: '0.82rem', marginBottom: 16 }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)', padding: '8px 16px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
                onClick={() => setDeleteModal(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{
                  background: 'var(--rose)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: 'var(--r-sm)',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: isDeleting ? 0.7 : 1
                }}
                onClick={executeDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Action Bar (only in select mode) ── */}
      {selectMode && (
        <div className="floating-action-bar">
          <button className="fab-clear" onClick={clearSelection} title="Exit selection">
            <X size={18} />
          </button>
          
          <button className="fab-btn fab-select-all" onClick={selectAll} title={allSelected ? "Deselect All" : "Select All"}>
            <CheckSquare size={16} />
            <span className="fab-btn-label">{allSelected ? 'Deselect All' : 'Select All'}</span>
          </button>

          <span className="fab-count">{selectedFiles.size} selected</span>

          <button
            className="fab-btn fab-share"
            onClick={handleShareSelected}
            disabled={selectedFiles.size === 0}
            title="Share Selected"
          >
            <Share2 size={16} />
            <span className="fab-btn-label">Share</span>
          </button>

          <button
            className="fab-btn fab-download"
            onClick={handleDownloadZip}
            disabled={selectedFiles.size === 0}
            title="Download Zip"
          >
            <Download size={16} />
            <span className="fab-btn-label">Zip</span>
          </button>

          <button
            className="fab-btn fab-delete"
            onClick={promptDeleteSelected}
            disabled={selectedFiles.size === 0}
            title="Delete Selected"
          >
            <Trash2 size={16} />
            <span className="fab-btn-label">Delete</span>
          </button>
        </div>
      )}
    </div>
  );
}
