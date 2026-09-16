import React, { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { StorageService } from '../services/api';

export function NewFolderModal({ activeDriveId, currentPath, onClose, onSuccess }) {
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await StorageService.createFolder(activeDriveId, currentPath, folderName.trim());
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderPlus size={20} color="var(--amber)" />
            <span className="modal-title">New Folder</span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', color: 'var(--rose)', borderRadius: 'var(--r-sm)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}
          <input
            type="text"
            className="input"
            autoFocus
            placeholder="Folder name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            disabled={loading}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !folderName.trim()}>
              {loading ? 'Creating...' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
