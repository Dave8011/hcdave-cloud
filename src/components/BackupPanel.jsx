import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive, Play, Square, RefreshCw, Clock, HardDrive, AlertTriangle,
  CheckCircle2, RotateCcw, ChevronDown, ChevronUp, Trash2, Zap
} from 'lucide-react';
import { StorageService } from '../services/api';

function ProgBar({ pct }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 999, height: 7, overflow: 'hidden', margin: '6px 0' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: 'linear-gradient(90deg, var(--indigo), var(--violet))', borderRadius: 999, transition: 'width 0.5s ease' }} />
    </div>
  );
}

export function BackupPanel({ drives }) {
  const [status, setStatus]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [sourceDrive, setSourceDrive] = useState('');
  const [destDrive, setDestDrive]   = useState('');
  const [schedTime, setSchedTime]   = useState('02:00');
  const [schedEnabled, setSchedEnabled] = useState(false);
  const [showArchives, setShowArchives] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await StorageService.getBackupStatus();
      setStatus(data);
      if (data.schedule) {
        setSchedTime(data.schedule.startTime || '02:00');
        setSchedEnabled(data.schedule.enabled || false);
      }
      setError('');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    // Auto-set first available drives
    if (drives && drives.length >= 1) {
      setSourceDrive(drives[0].id);
      if (drives.length >= 2) setDestDrive(drives[1].id);
    }
  }, [refresh, drives?.length]);

  useEffect(() => {
    if (!status?.job?.running) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [status?.job?.running, refresh]);

  const handleStartBackup = async () => {
    if (!sourceDrive || !destDrive) { setError('Select both source and backup drives'); return; }
    if (sourceDrive === destDrive) { setError('Source and backup drives must be different'); return; }
    setError('');
    try {
      await StorageService.startBackup(sourceDrive, destDrive, schedTime);
      setTimeout(refresh, 800);
    } catch (e) { setError(e.message); }
  };

  const handleStopBackup = async () => {
    try { await StorageService.stopBackup(); setTimeout(refresh, 500); }
    catch (e) { setError(e.message); }
  };

  const handleRestoreBackup = async (archivePath, targetDriveId) => {
    if (!window.confirm('Restore this backup? Files will be extracted to the target drive.')) return;
    try {
      await StorageService.restoreBackup(archivePath, targetDriveId);
      setError('');
      alert('Restore started! Files will appear on the drive when complete.');
    } catch (e) { setError(e.message); }
  };

  const handleSaveSchedule = async () => {
    try {
      await StorageService.setBackupSchedule(schedEnabled, schedTime, sourceDrive, destDrive);
      setError('');
    } catch (e) { setError(e.message); }
  };

  const job = status?.job;
  const pct = job?.total > 0 ? Math.round((job.done / job.total) * 100) : 0;

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-3)', fontSize: '0.82rem' }}>
      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', marginBottom: 6 }} /><br />Loading…
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--rose)', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* How it works info */}
      <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
        <div style={{ fontWeight: 700, color: 'var(--indigo)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={13} /> Smart Compression Backup
        </div>
        Compresses your entire drive into a <strong>.tar.gz archive</strong> on the backup drive.
        A 2 GB folder can shrink to just ~50 KB (text/documents). Videos compress less.
        Click Restore to decompress and recover files.
      </div>

      {/* Drive selection */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <HardDrive size={14} color="var(--cyan)" /> Select Drives
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 5 }}>SOURCE DRIVE (backup this)</div>
            <select value={sourceDrive} onChange={e => setSourceDrive(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 7, padding: '8px 10px', fontSize: '0.82rem', cursor: 'pointer' }}>
              <option value="">— Select drive —</option>
              {drives.map(d => <option key={d.id} value={d.id}>{d.name} ({d.usedGB}GB used)</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 5 }}>BACKUP DRIVE (save to)</div>
            <select value={destDrive} onChange={e => setDestDrive(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 7, padding: '8px 10px', fontSize: '0.82rem', cursor: 'pointer' }}>
              <option value="">— Select drive —</option>
              {drives.filter(d => d.id !== sourceDrive).map(d => <option key={d.id} value={d.id}>{d.name} ({d.freeGB}GB free)</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Job progress */}
      {(job?.running || job?.lastArchive) && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--text-1)' }}>
            {job.running
              ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} color="var(--cyan)" /> Backup Running…</>
              : <><CheckCircle2 size={13} color="var(--emerald)" /> Last Backup Complete</>}
          </div>
          {job.currentFile && <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📦 {job.currentFile}</div>}
          <ProgBar pct={pct} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-3)' }}>
            <span>{job.done} / {job.total} files</span>
            <span>{pct}%</span>
          </div>
          {job.lastArchive && <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--emerald)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Archive size={11} /> Saved: {job.lastArchive.split('/').pop()}
          </div>}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8 }}>
        {job?.running ? (
          <button onClick={handleStopBackup} className="btn"
            style={{ flex: 1, background: 'rgba(244,63,94,0.15)', color: 'var(--rose)', border: '1px solid rgba(244,63,94,0.3)' }}>
            <Square size={14} /> Stop Backup
          </button>
        ) : (
          <button onClick={handleStartBackup} className="btn btn-primary" style={{ flex: 1 }}
            disabled={!sourceDrive || !destDrive || sourceDrive === destDrive}>
            <Play size={14} /> Start Backup Now
          </button>
        )}
        <button onClick={refresh} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 12px', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Schedule */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={14} color="var(--amber)" /> Automatic Night Backup
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.83rem' }}>
            <div onClick={() => setSchedEnabled(e => !e)}
              style={{ width: 40, height: 22, borderRadius: 11, background: schedEnabled ? 'var(--indigo)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 3, left: schedEnabled ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
            {schedEnabled ? 'Auto Backup ON' : 'Auto Backup OFF'}
          </label>
          <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} disabled={!schedEnabled}
            style={{ background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 8px', fontSize: '0.85rem', opacity: schedEnabled ? 1 : 0.4 }} />
        </div>
        <button className="btn btn-ghost" style={{ width: '100%', fontSize: '0.82rem' }} onClick={handleSaveSchedule}>
          <CheckCircle2 size={13} /> Save Schedule
        </button>
        {status?.schedule?.lastRun && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 8 }}>
            Last run: {new Date(status.schedule.lastRun).toLocaleString()}
          </div>
        )}
      </div>

      {/* Archives / Restore */}
      {status?.archives?.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px' }}>
          <button onClick={() => setShowArchives(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-1)', padding: 0 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Archive size={14} color="var(--violet)" /> Saved Archives ({status.archives.length})
            </span>
            {showArchives ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showArchives && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {status.archives.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 2 }}>
                      {new Date(a.createdAt).toLocaleString()} · {(a.size / 1e9).toFixed(2)} GB
                    </div>
                  </div>
                  <button onClick={() => handleRestoreBackup(a.path, sourceDrive)}
                    style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--indigo)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    <RotateCcw size={12} /> Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
