import React, { useState, useEffect } from 'react';
import { X, CornerUpLeft, Folder, ChevronRight, AlertTriangle, ArrowRightCircle } from 'lucide-react';
import { StorageService } from '../services/api';

export function MoveModal({ activeDrive, pathsToMove, onClose, onComplete }) {
  const [destPath, setDestPath] = useState('/');
  const [browserPath, setBrowserPath] = useState('/');
  const [folders, setFolders] = useState([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState('');

  // Fetch folders for the mini-browser
  useEffect(() => {
    let active = true;
    const fetchFolders = async () => {
      setIsLoadingFolders(true);
      try {
        const items = await StorageService.listFiles(activeDrive.id, browserPath);
        if (active) {
          // Only show folders, and filter out folders that are in the pathsToMove
          const folderItems = items.filter(f => f.type === 'folder' && !pathsToMove.includes(f.path));
          setFolders(folderItems);
        }
      } catch (err) {
        if (active) setFolders([]);
      } finally {
        if (active) setIsLoadingFolders(false);
      }
    };
    fetchFolders();
    return () => { active = false; };
  }, [activeDrive.id, browserPath, pathsToMove]);

  // Sync browserPath to destPath when navigating
  useEffect(() => {
    setDestPath(browserPath);
  }, [browserPath]);

  const handleNavigateUp = () => {
    if (browserPath === '/') return;
    const parts = browserPath.split('/').filter(Boolean);
    parts.pop();
    setBrowserPath(parts.length ? '/' + parts.join('/') : '/');
  };

  const handleNavigateIn = (folderName) => {
    setBrowserPath(browserPath === '/' ? `/${folderName}` : `${browserPath}/${folderName}`);
  };

  const handleMove = async (e) => {
    e.preventDefault();
    if (!pathsToMove || pathsToMove.length === 0 || !destPath.trim()) return;

    setIsMoving(true);
    setError('');
    try {
      await StorageService.moveFiles(activeDrive.id, pathsToMove, destPath.trim());
      onComplete();
    } catch (err) {
      setError(err.message || 'Failed to move');
      setIsMoving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !isMoving && onClose()}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, padding: 0 }}>
        <div className="modal-title-row" style={{ padding: '24px 24px 16px 24px', borderBottom: '1px solid var(--border)' }}>
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowRightCircle size={18} /> Move {pathsToMove.length > 1 ? `${pathsToMove.length} Items` : 'Item'}
          </div>
          <button onClick={onClose} disabled={isMoving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleMove}>
          <div style={{ padding: '20px 24px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: 8 }}>
              Destination Path
            </label>
            <input
              type="text"
              value={destPath}
              onChange={e => {
                setDestPath(e.target.value);
                // Try to sync browser path if they type a valid absolute path
                if (e.target.value.startsWith('/')) {
                  setBrowserPath(e.target.value);
                }
              }}
              className="txt-input"
              style={{ width: '100%', marginBottom: 16 }}
              placeholder="/ (Root)"
              disabled={isMoving}
            />

            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--bg-card)' }}>
              {/* Browser Header */}
              <div style={{ padding: '10px 14px', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', borderBottom: '1px solid var(--border)' }}>
                <button 
                  type="button" 
                  onClick={handleNavigateUp} 
                  disabled={browserPath === '/' || isMoving}
                  style={{ background: 'none', border: 'none', cursor: browserPath === '/' ? 'default' : 'pointer', color: browserPath === '/' ? 'var(--text-4)' : 'var(--text-1)', padding: 4, display: 'flex' }}
                >
                  <CornerUpLeft size={16} />
                </button>
                <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>{browserPath}</div>
              </div>
              
              {/* Browser List */}
              <div style={{ maxHeight: 200, overflowY: 'auto', padding: '6px 0' }}>
                {isLoadingFolders ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-4)', fontSize: '0.85rem' }}>Loading folders...</div>
                ) : folders.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-4)', fontSize: '0.85rem' }}>No folders here</div>
                ) : (
                  folders.map(f => (
                    <div 
                      key={f.path}
                      onClick={() => !isMoving && handleNavigateIn(f.name)}
                      style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: isMoving ? 'default' : 'pointer', fontSize: '0.85rem', color: 'var(--text-2)' }}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Folder size={16} color="var(--indigo)" />
                      <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <ChevronRight size={14} color="var(--text-4)" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 24px 16px 24px', display: 'flex', gap: 6, alignItems: 'flex-start', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '12px', borderRadius: 'var(--r-sm)', fontSize: '0.85rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>{error}</div>
            </div>
          )}

          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--bg-hover)' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isMoving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isMoving || !destPath.trim()}>
              {isMoving ? 'Moving...' : 'Move Here'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
