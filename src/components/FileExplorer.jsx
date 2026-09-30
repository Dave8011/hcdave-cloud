import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Folder, FileText, Image as Img, Film, Archive,
  Grid3X3, List, ChevronRight, HardDrive, Eye, FolderOpen, Share2, RefreshCw,
  CheckCircle2, Circle, Download, X, Trash2, CheckSquare, AlertTriangle, Edit2, ArrowRightCircle, MoreVertical
} from 'lucide-react';
import { ShareModal } from './ShareModal';
import { MoveModal } from './MoveModal';
import { RenameModal } from './RenameModal';
import { FilePreviewModal } from './FilePreviewModal';
import { StorageService } from '../services/api';

const TYPE_MAP = {
  folder:   { cls: 'folder',   Icon: Folder },
  image:    { cls: 'image',    Icon: Img },
  video:    { cls: 'video',    Icon: Film },
  archive:  { cls: 'archive',  Icon: Archive },
  document: { cls: 'document', Icon: FileText },
};

const LONG_PRESS_MS = 500;

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function FileExplorer({ files: rawFiles = [], isLoading, activeDrive, currentPath, setCurrentPath, onRefresh }) {
  const [typeFilter, setTypeFilter] = useState('all');
  
  const files = React.useMemo(() => {
    if (typeFilter === 'all') return rawFiles;
    return rawFiles.filter(f => f.type === typeFilter);
  }, [rawFiles, typeFilter]);

  const [view, setView] = useState('grid');
  const [shareFiles, setShareFiles] = useState(null); // array of file objects or single file object
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState(null); // { paths: string[], names: string[] }
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [moveModal, setMoveModal] = useState(null);
  const [renameModal, setRenameModal] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);

  useEffect(() => {
    const handleGlobalClick = () => setActiveMenuId(null);
    if (activeMenuId) window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [activeMenuId]);

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
      setPreviewFile(file);
    }
  }, [selectMode, toggleSelect, currentPath, setCurrentPath]);

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

  const promptMoveSelected = () => {
    if (selectedFiles.size === 0) return;
    setMoveModal({ paths: Array.from(selectedFiles) });
  };

  const promptSingleMove = (file, e) => {
    if (e) e.stopPropagation();
    setMoveModal({ paths: [file.path] });
  };

  const promptSingleRename = (file, e) => {
    if (e) e.stopPropagation();
    setRenameModal({ file });
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
  const displayFiles = files.filter(f => f.name !== '.hcdave-chunks');
  const allSelected = displayFiles.length > 0 && selectedFiles.size === displayFiles.length;

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
          <select
            className="custom-select"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setSelectedFiles(new Set());
              setSelectMode(false);
            }}
          >
            <option value="all">All Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="document">Docs</option>
            <option value="archive">Zips</option>
          </select>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
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
      {!isLoading && displayFiles.length === 0 && (
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
      {!isLoading && displayFiles.length > 0 && view === 'grid' && (
        <div className="file-grid">
          {displayFiles.map((file) => {
            const { cls, Icon } = TYPE_MAP[file.type] || TYPE_MAP.document;
            const isSelected = selectedFiles.has(file.path);
            return (
              <div
                key={file.id || file.path}
                className={`file-card ${isSelected ? 'selected' : ''}`}
                style={{ position: 'relative', userSelect: 'none', zIndex: activeMenuId === file.path ? 100 : undefined }}
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
                  {/* Action Menu */}
                  {!selectMode && (
                    <div className="card-action">
                      <button
                        className="btn-icon"
                        style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === file.path ? null : file.path); }}
                      >
                        <MoreVertical size={24} />
                      </button>
                      
                      {activeMenuId === file.path && (
                        <div className="dropdown-menu" style={{ top: '100%', right: 0, marginTop: 4 }}>
                          <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); setShareFiles([file]); }}><Share2 size={14}/> Share</button>
                          <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); setPreviewFile(file); }}><Eye size={14}/> Preview</button>
                          <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); promptSingleRename(file, e); }}><Edit2 size={14}/> Rename</button>
                          <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); promptSingleMove(file, e); }}><ArrowRightCircle size={14}/> Move</button>
                          <button className="dropdown-item danger" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); promptSingleDelete(file, e); }}><Trash2 size={14}/> Delete</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="card-bottom">
                  <div className="card-name" title={file.name}>{file.name}</div>
                  <div className="card-meta">
                    <span>
                      {file.type === 'folder'
                        ? (file.items !== undefined ? `${file.items} items` : 'Folder')
                        : (file.size === 'Unknown' ? file.type.charAt(0).toUpperCase() + file.type.slice(1) : file.size)
                      }
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── List View ── */}
      {!isLoading && displayFiles.length > 0 && view === 'list' && (
        <div className="file-list">
          {displayFiles.map((file, i) => {
            const { cls, Icon } = TYPE_MAP[file.type] || TYPE_MAP.document;
            const isSelected = selectedFiles.has(file.path);
            return (
              <div
                key={file.id || file.path}
                className={`list-row ${isSelected ? 'selected' : ''} ${selectMode ? 'is-select-mode' : ''}`}
                style={{ animationDelay: `${i * 0.04}s`, userSelect: 'none', zIndex: activeMenuId === file.path ? 100 : undefined, position: 'relative' }}
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
                <div className="list-meta" style={{ flexShrink: 0 }}>
                  {file.type === 'folder'
                    ? (file.items !== undefined ? `${file.items} items` : 'Folder')
                    : (file.size === 'Unknown' ? file.type.charAt(0).toUpperCase() + file.type.slice(1) : file.size)
                  }
                </div>

                {!selectMode && (
                  <div className="list-actions" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
                    <button
                      className="btn-icon"
                      style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
                      onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === file.path ? null : file.path); }}
                    >
                      <MoreVertical size={18} />
                    </button>
                    
                    {activeMenuId === file.path && (
                      <div className="dropdown-menu" style={{ top: '100%', right: 0, marginTop: 4 }}>
                        <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); setShareFiles([file]); }}><Share2 size={14}/> Share</button>
                        <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); setPreviewFile(file); }}><Eye size={14}/> Preview</button>
                        <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); promptSingleRename(file, e); }}><Edit2 size={14}/> Rename</button>
                        <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); promptSingleMove(file, e); }}><ArrowRightCircle size={14}/> Move</button>
                        <button className="dropdown-item danger" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); promptSingleDelete(file, e); }}><Trash2 size={14}/> Delete</button>
                      </div>
                    )}
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
            className="fab-btn fab-move"
            onClick={promptMoveSelected}
            disabled={selectedFiles.size === 0}
            title="Move Selected"
          >
            <ArrowRightCircle size={16} />
            <span className="fab-btn-label">Move</span>
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

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)', marginLeft: 8, marginRight: 8 }} />

          <button
            className="fab-btn fab-delete"
            onClick={promptDeleteSelected}
            disabled={selectedFiles.size === 0}
            title="Delete Selected"
          >
            <Trash2 size={16} />
            <span className="fab-btn-label">Delete</span>
          </button>

          <div style={{ flex: 1 }} />
          <div className="selection-stats" style={{ color: 'var(--text-2)', fontSize: '0.85rem', fontWeight: 500, paddingRight: 16 }}>
            {selectedFiles.size} item{selectedFiles.size !== 1 ? 's' : ''} selected
            {(() => {
              const totalBytes = displayFiles
                .filter(f => selectedFiles.has(f.path))
                .reduce((sum, f) => sum + (f.rawSize || 0), 0);
              return totalBytes > 0 ? ` • ${formatSize(totalBytes)}` : '';
            })()}
          </div>
        </div>
      )}

      {renameModal && (
        <RenameModal
          activeDrive={activeDrive}
          file={renameModal.file}
          onClose={() => setRenameModal(null)}
          onComplete={() => { setRenameModal(null); onRefresh(); }}
        />
      )}

      {moveModal && (
        <MoveModal
          activeDrive={activeDrive}
          pathsToMove={moveModal.paths}
          onClose={() => setMoveModal(null)}
          onComplete={() => { setMoveModal(null); clearSelection(); onRefresh(); }}
        />
      )}

      {previewFile && (
        <FilePreviewModal
          initialFile={previewFile}
          files={files}
          selectedPaths={selectedFiles}
          driveId={activeDrive.id}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
