import React, { useState, useEffect } from 'react';
import { X, CornerUpLeft, Folder, ChevronRight, AlertTriangle, ArrowRightCircle, Copy, HardDrive } from 'lucide-react';
import { StorageService } from '../services/api';

/**
 * MoveModal — handles:
 *  - Move within same drive (fast rename)
 *  - Copy to same drive
 *  - Move or Copy to a different drive (cross-drive)
 */
export function MoveModal({ activeDrive, drives = [], pathsToMove, onClose, onComplete }) {
  const [destPath, setDestPath]         = useState('/');
  const [browserPath, setBrowserPath]   = useState('/');
  const [folders, setFolders]           = useState([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isBusy, setIsBusy]             = useState(false);
  const [error, setError]               = useState('');
  const [mode, setMode]                 = useState('move'); // 'move' | 'copy'
  const [targetDriveId, setTargetDriveId] = useState(activeDrive.id);

  const targetDrive = drives.find(d => d.id === targetDriveId) || activeDrive;

  // Fetch folders for the mini-browser (uses targetDriveId)
  useEffect(() => {
    let active = true;
    const fetchFolders = async () => {
      setIsLoadingFolders(true);
      try {
        const items = await StorageService.listFiles(targetDriveId, browserPath);
        if (active) {
          const folderItems = items.filter(f => f.type === 'folder' &&
            // Only filter out source paths if same drive
            (targetDriveId !== activeDrive.id || !pathsToMove.includes(f.path)));
          setFolders(folderItems);
        }
      } catch { if (active) setFolders([]); }
      finally { if (active) setIsLoadingFolders(false); }
    };
    fetchFolders();
    return () => { active = false; };
  }, [targetDriveId, browserPath, pathsToMove, activeDrive.id]);

  // Reset browser when drive changes
  useEffect(() => {
    setBrowserPath('/');
    setDestPath('/');
  }, [targetDriveId]);

  useEffect(() => { setDestPath(browserPath); }, [browserPath]);

  const handleNavigateUp = () => {
    if (browserPath === '/') return;
    const parts = browserPath.split('/').filter(Boolean);
    parts.pop();
    setBrowserPath(parts.length ? '/' + parts.join('/') : '/');
  };

  const handleNavigateIn = (name) => {
    setBrowserPath(browserPath === '/' ? `/${name}` : `${browserPath}/${name}`);
  };

  const handleAction = async (e) => {
    e.preventDefault();
    if (!pathsToMove || pathsToMove.length === 0 || !destPath.trim()) return;
    setIsBusy(true);
    setError('');

    try {
      const isCrossDrive = targetDriveId !== activeDrive.id;
      if (isCrossDrive || mode === 'copy') {
        // Cross-drive copy or same-drive copy
        await StorageService.copyFiles(activeDrive.id, targetDriveId, pathsToMove, destPath.trim());
      } else {
        // Same-drive move (fast)
        await StorageService.moveFiles(activeDrive.id, pathsToMove, destPath.trim());
      }
      onComplete();
    } catch (err) {
      setError(err.message || 'Operation failed');
      setIsBusy(false);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, onClose]);

  const isCrossDrive = targetDriveId !== activeDrive.id;
  const actionLabel = isCrossDrive ? 'Copy to Drive' : (mode === 'copy' ? 'Copy Here' : 'Move Here');

  return (
    <div className="modal-overlay" onClick={() => !isBusy && onClose()}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-label="Move or Copy Items"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 520, padding: 0 }}
      >
        <div className="modal-title-row" style={{ padding: '20px 24px 14px 24px', borderBottom: '1px solid var(--border)' }}>
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isCrossDrive || mode === 'copy'
              ? <><Copy size={17} /> Copy {pathsToMove.length > 1 ? `${pathsToMove.length} Items` : 'Item'}</>
              : <><ArrowRightCircle size={17} /> Move {pathsToMove.length > 1 ? `${pathsToMove.length} Items` : 'Item'}</>
            }
          </div>
          <button onClick={onClose} disabled={isBusy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleAction}>
          <div style={{ padding: '16px 24px' }}>

            {/* Mode selector — only show when same drive */}
            {!isCrossDrive && (
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 4, marginBottom: 14, gap: 4 }}>
                {['move', 'copy'].map(m => (
                  <button key={m} type="button" onClick={() => setMode(m)} style={{
                    flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: 600,
                    background: mode === m ? 'var(--bg-card)' : 'transparent',
                    color: mode === m ? 'var(--text-1)' : 'var(--text-3)'
                  }}>
                    {m === 'move' ? '↪ Move' : '⎘ Copy'}
                  </button>
                ))}
              </div>
            )}

            {/* Target drive */}
            {drives.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <HardDrive size={12} /> Target Drive
                </label>
                <select
                  value={targetDriveId}
                  onChange={e => setTargetDriveId(e.target.value)}
                  disabled={isBusy}
                  className="custom-select"
                  style={{ width: '100%' }}
                >
                  {drives.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.id === activeDrive.id ? '(current)' : `— ${d.freeGB} GB free`}
                    </option>
                  ))}
                </select>
                {isCrossDrive && (
                  <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Copy size={10} /> Cross-drive copy — files will be copied (not moved)
                  </div>
                )}
              </div>
            )}

            {/* Destination path input */}
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 6 }}>
              Destination Path on {targetDrive.name}
            </label>
            <input
              type="text"
              value={destPath}
              onChange={e => {
                setDestPath(e.target.value);
                if (e.target.value.startsWith('/')) setBrowserPath(e.target.value);
              }}
              className="txt-input"
              style={{ width: '100%', marginBottom: 12 }}
              placeholder="/ (Root)"
              disabled={isBusy}
            />

            {/* Folder browser */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--bg-card)' }}>
              <div style={{ padding: '8px 12px', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', borderBottom: '1px solid var(--border)' }}>
                <button type="button" onClick={handleNavigateUp} disabled={browserPath === '/' || isBusy}
                  style={{ background: 'none', border: 'none', cursor: browserPath === '/' ? 'default' : 'pointer', color: browserPath === '/' ? 'var(--text-4)' : 'var(--text-1)', padding: 4, display: 'flex' }}>
                  <CornerUpLeft size={15} />
                </button>
                <div style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: '0.82rem' }}>{browserPath}</div>
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
                {isLoadingFolders ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-4)', fontSize: '0.82rem' }}>Loading…</div>
                ) : folders.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-4)', fontSize: '0.82rem' }}>No folders here</div>
                ) : (
                  folders.map(f => (
                    <div key={f.path} onClick={() => !isBusy && handleNavigateIn(f.name)}
                      style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 9, cursor: isBusy ? 'default' : 'pointer', fontSize: '0.83rem', color: 'var(--text-2)' }}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <Folder size={15} color="var(--indigo)" />
                      <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <ChevronRight size={13} color="var(--text-4)" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 24px 14px', display: 'flex', gap: 6, alignItems: 'flex-start', background: 'rgba(239,68,68,0.1)', color: 'var(--rose)', padding: '10px 12px', borderRadius: 'var(--r-sm)', fontSize: '0.82rem' }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>{error}</div>
            </div>
          )}

          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--bg-hover)' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isBusy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isBusy || !destPath.trim()}>
              {isBusy
                ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>↻</span> Working…</>
                : actionLabel
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
