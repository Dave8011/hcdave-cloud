import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive, Play, Square, RefreshCw, Clock, HardDrive, AlertTriangle,
  CheckCircle2, RotateCcw, ChevronDown, ChevronUp, Zap
} from 'lucide-react';
import { StorageService } from '../services/api';

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toFixed(n >= 100 ? 0 : 1) + ' ' + units[i];
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'calculating…';
  if (seconds < 60) return Math.round(seconds) + ' sec';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' min';
  return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
}

function ProgBar({ pct, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 999, height: 8, overflow: 'hidden', margin: '7px 0' }}>
      <div style={{ width: Math.max(0, Math.min(100, pct)) + '%', height: '100%', background: color || 'linear-gradient(90deg, var(--indigo), var(--violet))', borderRadius: 999, transition: 'width 0.35s ease' }} />
    </div>
  );
}

function StatusPill({ status }) {
  const colors = {
    completed: ['rgba(16,185,129,0.14)', 'var(--emerald)'],
    running: ['rgba(34,211,238,0.14)', 'var(--cyan)'],
    pending: ['rgba(99,102,241,0.14)', 'var(--indigo)'],
    waiting: ['rgba(245,158,11,0.14)', 'var(--amber)'],
    paused: ['rgba(245,158,11,0.14)', 'var(--amber)'],
    error: ['rgba(244,63,94,0.14)', 'var(--rose)'],
    idle: ['rgba(255,255,255,0.06)', 'var(--text-3)'],
    'not-started': ['rgba(255,255,255,0.06)', 'var(--text-3)']
  };
  const pair = colors[status] || colors.idle;
  return (
    <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', background: pair[0], color: pair[1], whiteSpace: 'nowrap' }}>
      {(status || 'unknown').replace(/-/g, ' ')}
    </span>
  );
}

export function BackupPanel({ drives }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sourceDrive, setSourceDrive] = useState('');
  const [destDrives, setDestDrives] = useState([]);
  const [schedTime, setSchedTime] = useState('02:00');
  const [schedEnabled, setSchedEnabled] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [showMirrorDetails, setShowMirrorDetails] = useState(true);

  const driveSignature = (drives || []).map(d => [d.id, d.identityKey, d.name, d.role].join(':')).join('|');

  const refresh = useCallback(async () => {
    try {
      const data = await StorageService.getBackupStatus();
      setStatus(data);
      if (data.schedule) {
        setSchedTime(data.schedule.startTime || '02:00');
        setSchedEnabled(!!data.schedule.enabled);
      }
      setError('');
    } catch (e) {
      setError(e.message || 'Backup status unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!drives || !drives.length) {
      setSourceDrive('');
      setDestDrives([]);
      return;
    }
    const preferredSource = drives.find(d => (d.role || '').toLowerCase() === 'master') || drives[0];
    setSourceDrive(current => drives.some(d => d.id === current) ? current : preferredSource.id);
    setDestDrives(current => {
      const valid = current.filter(id => drives.some(d => d.id === id) && id !== (drives.some(d => d.id === sourceDrive) ? sourceDrive : preferredSource.id));
      if (valid.length) return valid;
      const backupTargets = drives.filter(d => d.id !== preferredSource.id && (d.role || '').toLowerCase() === 'backup');
      if (backupTargets.length) return backupTargets.map(d => d.id);
      const fallback = drives.find(d => d.id !== preferredSource.id);
      return fallback ? [fallback.id] : [];
    });
  // driveSignature deliberately captures identity/name/role changes as well as additions and removals.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveSignature]);

  useEffect(() => {
    const schedule = status && status.schedule;
    if (!schedule || !drives || !drives.length) return;
    const resolveId = key => {
      const d = drives.find(item => item.id === key || item.uuid === key || item.identityKey === key);
      return d ? d.id : '';
    };
    const scheduledSource = resolveId(schedule.sourceDriveId);
    if (scheduledSource) setSourceDrive(scheduledSource);
    const keys = Array.isArray(schedule.destDriveIds) && schedule.destDriveIds.length
      ? schedule.destDriveIds
      : (schedule.destDriveId ? [schedule.destDriveId] : []);
    const mapped = keys.map(resolveId).filter(id => id && id !== scheduledSource);
    if (mapped.length) setDestDrives([...new Set(mapped)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.schedule?.sourceDriveId, (status?.schedule?.destDriveIds || []).join('|'), status?.schedule?.destDriveId, driveSignature]);

  const job = status && status.job;
  useEffect(() => {
    if (!job || (!job.running && !(job.waitingForDrives && status?.resumePlan?.autoResume) && !status?.restore?.running)) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [job?.running, job?.waitingForDrives, status?.resumePlan?.autoResume, status?.restore?.running, refresh]);

  const handleStartBackup = async () => {
    if (!sourceDrive) { setError('Select the source drive'); return; }
    if (!destDrives.length) { setError('Select at least one backup destination'); return; }
    if (destDrives.includes(sourceDrive)) { setError('The source drive cannot also be a destination'); return; }
    setError('');
    try {
      await StorageService.startBackup(sourceDrive, destDrives, schedTime);
      await refresh();
    } catch (e) {
      setError(e.message || 'Failed to start backup');
    }
  };

  const handleStopBackup = async () => {
    try {
      await StorageService.stopBackup();
      await refresh();
    } catch (e) {
      setError(e.message || 'Failed to pause backup');
    }
  };

  const handleRestoreBackup = async (archivePath, targetDriveId) => {
    if (!window.confirm('Restore this legacy .tar.gz archive? Files will be extracted to the target drive and may overwrite matching paths.')) return;
    try {
      await StorageService.restoreBackup(archivePath, targetDriveId);
      setError('');
      alert('Legacy restore started. Check the destination when it finishes.');
    } catch (e) {
      setError(e.message || 'Failed to restore archive');
    }
  };

  const handleRestoreMirror = async mirror => {
    if (!sourceDrive) { setError('Select a restore destination drive first'); return; }
    if (sourceDrive === mirror.destinationDriveId) {
      setError('The restore target must be different from the backup drive');
      return;
    }
    const target = drives.find(d => d.id === sourceDrive);
    const targetName = target ? target.name : 'selected drive';
    if (!window.confirm('Restore the latest verified backup from ' + mirror.destinationName + ' to ' + targetName + '? Files will be extracted under hcdave-restored/ in a new timestamped folder. Existing files will not be overwritten.')) return;
    try {
      const result = await StorageService.restoreMirrorBackup(mirror.destinationDriveId, mirror.sourceIdentity, sourceDrive);
      setError('');
      alert(result.message || 'Restore started');
      await refresh();
    } catch (e) {
      setError(e.message || 'Failed to restore resumable backup');
    }
  };

  const handleSaveSchedule = async () => {
    if (schedEnabled && (!sourceDrive || !destDrives.length)) {
      setError('Choose one source and at least one backup destination before enabling the schedule');
      return;
    }
    try {
      await StorageService.setBackupSchedule(schedEnabled, schedTime, sourceDrive, destDrives);
      setError('');
      await refresh();
    } catch (e) {
      setError(e.message || 'Failed to save backup schedule');
    }
  };

  const pct = job?.totalBytes > 0
    ? Math.max(0, Math.min(100, Math.floor((Number(job.bytesDone) || 0) / job.totalBytes * 100)))
    : (job?.filesTotal > 0
      ? Math.max(0, Math.min(100, Math.floor((Number(job.filesDone) || 0) / job.filesTotal * 100)))
      : (Number(job?.percent) || 0));
  const hasJob = job && (job.status && job.status !== 'idle' || job.running || job.lastError || job.waitingForDrives);
  const mirrors = status?.mirrors || [];
  const archives = status?.archives || [];
  const selectedSource = drives.find(d => d.id === sourceDrive);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-3)', fontSize: '0.82rem' }}>
      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', marginBottom: 6 }} /><br />Loading…
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--rose)', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
        </div>
      )}

      <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
        <div style={{ fontWeight: 700, color: 'var(--indigo)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={13} /> Resumable Multi-Drive Backup
        </div>
        Backups are compressed into independent <strong>32 MB chunks</strong>. Progress is based on actual source bytes read, not a timer. Completed chunks are saved on each destination, so a restart or disconnect only repeats the unfinished chunk. You can select more than one backup SSD; each destination has its own manifest and recovery state. Older .tar.gz archives remain available below.
      </div>

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <HardDrive size={14} color="var(--cyan)" /> Select Drives
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 5 }}>SOURCE DRIVE (backup this)</div>
            <select
              value={sourceDrive}
              onChange={e => {
                const next = e.target.value;
                setSourceDrive(next);
                setDestDrives(current => current.filter(id => id !== next));
              }}
              className="custom-select"
              aria-label="Source drive to backup"
              style={{ width: '100%' }}
            >
              <option value="">— Select source drive —</option>
              {(drives || []).map(d => <option key={d.id} value={d.id}>{d.name} ({d.usedGB} GB used) {d.role ? '· ' + d.role : ''}</option>)}
            </select>
          </div>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', margin: '14px 0 7px' }}>BACKUP DESTINATIONS (select one or more)</div>
        {(drives || []).filter(d => d.id !== sourceDrive).length === 0 ? (
          <div style={{ padding: 10, color: 'var(--text-3)', fontSize: '0.82rem' }}>Connect a second storage drive to enable backups.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {(drives || []).filter(d => d.id !== sourceDrive).map(d => {
              const checked = destDrives.includes(d.id);
              return (
                <label key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px', background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.025)', border: '1px solid ' + (checked ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.08)'), borderRadius: 9, cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={e => setDestDrives(current => e.target.checked ? [...new Set([...current, d.id])] : current.filter(id => id !== d.id))} style={{ marginTop: 3 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-1)' }}>{d.name}</span>
                    <span style={{ display: 'block', marginTop: 3, fontSize: '0.72rem', color: 'var(--text-3)' }}>{d.freeGB} GB free {d.role ? '· ' + d.role : ''}</span>
                    <span style={{ display: 'block', marginTop: 3, fontSize: '0.65rem', color: 'var(--text-3)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{d.identityKey || d.uuid || d.id}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {hasJob && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9, color: 'var(--text-1)' }}>
            {job.running ? <RefreshCw size={14} className="spin" color="var(--cyan)" /> : <CheckCircle2 size={14} color={job.status === 'error' ? 'var(--rose)' : 'var(--emerald)'} />}
            Backup {job.running ? 'running' : job.status || 'status'}
            <span style={{ marginLeft: 'auto' }}><StatusPill status={job.status} /></span>
          </div>
          {job.currentTarget && <div style={{ fontSize: '0.77rem', marginBottom: 4, color: 'var(--text-2)' }}>Current destination: <strong>{job.currentTarget}</strong></div>}
          {job.currentFile && <div style={{ fontSize: '0.74rem', color: 'var(--text-2)', marginBottom: 6, overflowWrap: 'anywhere' }}>Processing: {job.currentFile}</div>}
          <ProgBar pct={pct} color={job.status === 'error' ? 'var(--rose)' : undefined} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-3)' }}>
            <span>{formatBytes(job.bytesDone)} / {formatBytes(job.totalBytes)}</span>
            <span>{pct}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 5, fontSize: '0.72rem', color: 'var(--text-3)' }}>
            <span>{job.filesDone || 0} / {job.filesTotal || 0} files verified</span>
            {job.running && <span>{formatBytes(job.speedBytesPerSec)}/s · ETA {formatDuration(job.etaSeconds)}</span>}
          </div>
          {job.targets?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
              {job.targets.map(t => {
                const targetPct = t.totalBytes > 0
                  ? Math.min(100, Math.floor((t.bytesDone || 0) / t.totalBytes * 100))
                  : (t.filesTotal > 0 ? Math.min(100, Math.floor((t.filesDone || 0) / t.filesTotal * 100)) : 0);
                return (
                  <div key={t.identityKey} style={{ padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.78rem', color: 'var(--text-1)' }}>{t.name}</strong>
                      <StatusPill status={t.status} />
                    </div>
                    <ProgBar pct={targetPct} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-3)', fontSize: '0.68rem', gap: 8 }}>
                      <span>{formatBytes(t.bytesDone)} / {formatBytes(t.totalBytes)}</span>
                      <span>{t.filesDone || 0}/{t.filesTotal || 0} files</span>
                    </div>
                    {t.error && <div style={{ color: 'var(--rose)', marginTop: 5, fontSize: '0.72rem', overflowWrap: 'anywhere' }}>{t.error}</div>}
                  </div>
                );
              })}
            </div>
          )}
          {job.lastError && <div style={{ marginTop: 9, fontSize: '0.78rem', color: 'var(--rose)', overflowWrap: 'anywhere' }}>{job.lastError}</div>}
          {(job.waitingForDrives || job.status === 'paused') && (
            <div style={{ marginTop: 9, padding: '8px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', color: 'var(--amber)', fontSize: '0.76rem' }}>
              Progress is checkpointed on each selected backup drive. Reconnect a missing drive or press Start again to resume completed chunks.
            </div>
          )}
          {job.lastCompletedAt && <div style={{ marginTop: 8, color: 'var(--text-3)', fontSize: '0.7rem' }}>Last completed: {new Date(job.lastCompletedAt).toLocaleString()}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {job?.running ? (
          <button onClick={handleStopBackup} className="btn" style={{ flex: 1, background: 'rgba(244,63,94,0.15)', color: 'var(--rose)', border: '1px solid rgba(244,63,94,0.3)' }}>
            <Square size={14} /> Pause Backup Safely
          </button>
        ) : (
          <button onClick={handleStartBackup} className="btn btn-primary" style={{ flex: 1 }} disabled={!sourceDrive || !destDrives.length || destDrives.includes(sourceDrive)}>
            <Play size={14} /> {job?.status === 'paused' || job?.status === 'waiting' ? 'Resume Backup' : 'Start Backup'}
          </button>
        )}
        <button onClick={refresh} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 12px', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center' }} aria-label="Refresh backup status">
          <RefreshCw size={13} />
        </button>
      </div>

      {mirrors.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 }}>
          <button onClick={() => setShowMirrorDetails(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-1)', padding: 0 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}><HardDrive size={14} color="var(--emerald)" /> Backup destinations ({mirrors.length})</span>
            {showMirrorDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showMirrorDetails && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mirrors.map((m, i) => {
                const mirrorPct = m.totalBytes > 0 ? Math.min(100, Math.floor(m.bytesDone / m.totalBytes * 100)) : 0;
                return (
                  <div key={m.destinationIdentity + ':' + m.sourceIdentity + ':' + i} style={{ padding: 11, borderRadius: 9, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--text-1)' }}>{m.sourceName} → {m.destinationName}</strong>
                      <StatusPill status={m.status} />
                    </div>
                    <ProgBar pct={mirrorPct} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', color: 'var(--text-3)', fontSize: '0.7rem' }}>
                      <span>{formatBytes(m.bytesDone)} / {formatBytes(m.totalBytes)}</span>
                      <span>{m.filesDone || 0}/{m.filesTotal || 0} files</span>
                    </div>
                    {m.updatedAt && <div style={{ marginTop: 5, fontSize: '0.68rem', color: 'var(--text-3)' }}>Checkpoint: {new Date(m.updatedAt).toLocaleString()}</div>}
                    <button onClick={() => handleRestoreMirror(m)} className="btn btn-ghost" style={{ marginTop: 9, width: '100%', fontSize: '0.75rem' }} disabled={!sourceDrive || sourceDrive === m.destinationDriveId || m.status === 'running'}>
                      <RotateCcw size={12} /> Restore to selected source drive
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {status?.restore && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: '0.82rem' }}><RotateCcw size={14} /> Restore {status.restore.running ? 'in progress' : 'status'}</div>
          {status.restore.currentFile && <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-3)', overflowWrap: 'anywhere' }}>{status.restore.currentFile}</div>}
          <ProgBar pct={status.restore.totalBytes > 0 ? status.restore.bytesDone / status.restore.totalBytes * 100 : 0} />
          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{formatBytes(status.restore.bytesDone)} / {formatBytes(status.restore.totalBytes)} · {status.restore.filesDone}/{status.restore.filesTotal} files</div>
          {status.restore.restoreRoot && <div style={{ marginTop: 5, fontSize: '0.7rem', color: 'var(--emerald)', overflowWrap: 'anywhere' }}>Restore folder: {status.restore.restoreRoot}</div>}
          {status.restore.lastError && <div style={{ marginTop: 5, fontSize: '0.7rem', color: 'var(--rose)' }}>{status.restore.lastError}</div>}
        </div>
      )}

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={14} color="var(--amber)" /> Automatic Night Backup
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.83rem' }}>
            <input type="checkbox" checked={schedEnabled} onChange={e => setSchedEnabled(e.target.checked)} />
            {schedEnabled ? 'Auto Backup ON' : 'Auto Backup OFF'}
          </label>
          <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} disabled={!schedEnabled}
            style={{ background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 8px', fontSize: '0.85rem', opacity: schedEnabled ? 1 : 0.4 }} />
        </div>
        <div style={{ color: 'var(--text-3)', fontSize: '0.72rem', marginBottom: 8 }}>
          Schedule applies to the selected source and all checked backup destinations.
        </div>
        <button className="btn btn-ghost" style={{ width: '100%', fontSize: '0.82rem' }} onClick={handleSaveSchedule}>
          <CheckCircle2 size={13} /> Save Schedule
        </button>
        {status?.schedule?.lastRun && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 8 }}>Last scheduled run: {new Date(status.schedule.lastRun).toLocaleString()}</div>}
      </div>

      {archives.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14 }}>
          <button onClick={() => setShowArchives(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-1)', padding: 0 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Archive size={14} color="var(--violet)" /> Legacy .tar.gz Archives ({archives.length})</span>
            {showArchives ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showArchives && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {archives.map((a, i) => (
                <div key={a.path || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{a.name}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 2 }}>{new Date(a.createdAt).toLocaleString()} · {formatBytes(a.size)}</div>
                  </div>
                  <button onClick={() => handleRestoreBackup(a.path, sourceDrive)} className="btn btn-ghost" disabled={!sourceDrive}>
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
