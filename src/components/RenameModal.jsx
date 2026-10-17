import React, { useState, useEffect } from 'react';
import { X, Edit2, AlertTriangle } from 'lucide-react';
import { StorageService } from '../services/api';

export function RenameModal({ activeDrive, file, onClose, onComplete }) {
  const [newName, setNewName] = useState(file.name);
  const [isRenaming, setIsRenaming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setNewName(file.name);
  }, [file]);

  const handleRename = async (e) => {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === file.name) {
      onClose();
      return;
    }

    setIsRenaming(true);
    setError('');
    try {
      await StorageService.renameItem(activeDrive.id, file.path, newName.trim());
      onComplete();
    } catch (err) {
      setError(err.message || 'Failed to rename');
    } finally {
      setIsRenaming(false);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isRenaming) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRenaming, onClose]);

  return (
    <div className="modal-overlay" onClick={() => !isRenaming && onClose()}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-label="Rename Item"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 400 }}
      >
        <div className="modal-title-row">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Edit2 size={18} /> Rename Item
          </div>
          <button
            onClick={onClose}
            disabled={isRenaming}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleRename}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: 8 }}>
              New Name for <span style={{ color: 'var(--text-1)' }}>{file.name}</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="input"
              autoFocus
              disabled={isRenaming}
            />
          </div>

          {error && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '12px', borderRadius: 'var(--r-sm)', marginBottom: 16, fontSize: '0.85rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>{error}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isRenaming}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isRenaming || !newName.trim()}>
              {isRenaming ? 'Renaming...' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
