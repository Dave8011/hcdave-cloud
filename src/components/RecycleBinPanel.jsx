import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, RefreshCw, RotateCcw, X, AlertTriangle, Clock } from 'lucide-react';
import { StorageService } from '../services/api';

function formatSize(bytes) {
  if (!bytes) return '';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

export function RecycleBinPanel({ drives, activeDriveId }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(new Set());
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [error, setError]         = useState('');
  const [activeDrive, setActiveDrive] = useState(activeDriveId || drives?.[0]?.id || '');

  const load = useCallback(async () => {
    if (!activeDrive) return;
    setLoading(true);
    try {
      const data = await StorageService.listTrash(activeDrive);
      setItems(data || []);
      setError('');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [activeDrive]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (path) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  };

  const handleRestore = async () => {
    if (selected.size === 0) return;
    setRestoring(true);
    setError('');
    try {
      await StorageService.restoreTrash(activeDrive, Array.from(selected));
      setSelected(new Set());
      await load();
    } catch (e) { setError(e.message); } finally { setRestoring(false); }
  };

  const handleDeletePermanent = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Permanently delete ${selected.size} item(s)? This cannot be undone.`)) return;
    setDeleting(true);
    setError('');
    try {
      await StorageService.deleteTrash(activeDrive, Array.from(selected));
      setSelected(new Set());
      await load();
    } catch (e) { setError(e.message); } finally { setDeleting(false); }
  };

  const handleEmptyBin = async () => {
    if (!window.confirm('Empty the entire Recycle Bin? All items will be permanently deleted.')) return;
    setDeleting(true);
    try {
      await StorageService.emptyTrash(activeDrive);
      setItems([]);
      setSelected(new Set());
    } catch (e) { setError(e.message); } finally { setDeleting(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Drive selector */}
      {drives && drives.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Drive:</span>
          <select
            value={activeDrive}
            onChange={e => setActiveDrive(e.target.value)}
            className="custom-select"
          >
            {drives.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--rose)', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={load} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 12px', color: 'var(--text-2)', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
        </button>
        {selected.size > 0 && (
          <>
            <button onClick={handleRestore} disabled={restoring}
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--emerald)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              {restoring ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={12} />}
              Restore ({selected.size})
            </button>
            <button onClick={handleDeletePermanent} disabled={deleting}
              style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--rose)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              {deleting ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={12} />}
              Delete ({selected.size})
            </button>
          </>
        )}
        {items.length > 0 && (
          <button onClick={handleEmptyBin} disabled={deleting}
            style={{ marginLeft: 'auto', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', color: 'var(--rose)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Trash2 size={12} /> Empty Bin
          </button>
        )}
      </div>

      {/* Items */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-3)', fontSize: '0.82rem' }}>
          <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', marginBottom: 6 }} /><br />Loading…
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
          <Trash2 size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
          <div style={{ fontSize: '0.9rem' }}>Recycle Bin is empty</div>
          <div style={{ fontSize: '0.78rem', marginTop: 4 }}>Deleted files are moved here first</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
          {items.map(item => (
            <div key={item.trashPath}
              onClick={() => toggleSelect(item.trashPath)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                background: selected.has(item.trashPath) ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selected.has(item.trashPath) ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 9, cursor: 'pointer', transition: 'all 0.15s'
              }}>
              <input type="checkbox" checked={selected.has(item.trashPath)} onChange={() => {}} onClick={e => e.stopPropagation()}
                style={{ accentColor: 'var(--indigo)', width: 14, height: 14, flexShrink: 0 }} />
              <Trash2 size={14} color="var(--text-3)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'flex', gap: 8, marginTop: 2 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock size={10} /> {new Date(item.deletedAt).toLocaleString()}
                  </span>
                  {item.size > 0 && <span>{formatSize(item.size)}</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📂 {item.originalPath}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
