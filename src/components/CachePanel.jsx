import React, { useState, useEffect, useCallback } from 'react';
import {
  Database, Play, Pause, Square, CheckCircle2, AlertTriangle,
  RefreshCw, Clock, Zap, HardDrive, Film, ChevronDown, ChevronUp
} from 'lucide-react';
import { StorageService } from '../services/api';

const s = {
  card: { background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', padding: '14px', marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)' },
  row:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: '0.78rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5 },
  val:  { fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)' },
  sectionTitle: { fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, color: 'var(--text-1)' },
};

function ProgBar({ pct, color = 'var(--indigo)' }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 999, height: 7, overflow: 'hidden', margin: '8px 0' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 0.5s ease' }} />
    </div>
  );
}

export function CachePanel({ drives }) {
  const [status, setStatus]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [showList, setShowList] = useState(false);
  const [schedTime, setSchedTime] = useState('02:00');
  const [schedEnabled, setSchedEnabled] = useState(false);
  const [selectedDrives, setSelectedDrives] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const data = await StorageService.getCacheStatus();
      setStatus(data);
      setSchedTime(data.nightlySchedule?.startTime || '02:00');
      setSchedEnabled(data.nightlySchedule?.enabled || false);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll while job is running
  useEffect(() => {
    if (!status?.job?.running) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [status?.job?.running, refresh]);

  const handleStart = async () => {
    try {
      await StorageService.startCache(selectedDrives);
      refresh();
    } catch (e) { setError(e.message); }
  };

  const handlePause = async () => {
    try { await StorageService.pauseCache(); refresh(); }
    catch (e) { setError(e.message); }
  };

  const handleStop = async () => {
    try { await StorageService.stopCache(); refresh(); }
    catch (e) { setError(e.message); }
  };

  const handleSchedule = async () => {
    try {
      await StorageService.setCacheSchedule(schedEnabled, schedTime);
      setError('');
    } catch (e) { setError(e.message); }
  };

  const toggleDrive = (id) => {
    setSelectedDrives(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-3)', fontSize: '0.82rem' }}>
      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', marginBottom: 6 }} /><br />Loading cache status…
    </div>
  );

  const job  = status?.job;
  const pct  = job?.filesTotal > 0 ? Math.round((job.filesDone / job.filesTotal) * 100) : 0;
  const warn = status?.warn;

  return (
    <div>
      {/* Warning banner */}
      {warn && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} color="var(--rose)" />
          <span style={{ fontSize: '0.8rem', color: 'var(--rose)', fontWeight: 600 }}>
            Cache drive low on space — only {status.freeGB} GB free! Add more storage.
          </span>
        </div>
      )}

      {!status?.cacheMountExists && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.78rem', color: 'var(--amber)', lineHeight: 1.6 }}>
          <strong>⚠ Cache drive not found</strong> at <code>{status?.cacheMount}</code>.<br />
          Plug in your cache drive and set <code>CACHE_MOUNT=/your/path</code> in <code>agent/.env</code>.
        </div>
      )}

      {error && (
        <div style={{ fontSize: '0.78rem', color: 'var(--rose)', marginBottom: 10 }}>⚠ {error}</div>
      )}

      {/* Status overview */}
      <div style={s.card}>
        <div style={s.sectionTitle}><Database size={14} color="var(--cyan)" /> Cache Overview</div>
        <div style={s.row}>
          <span style={s.label}><Film size={12} /> Cached Videos</span>
          <span style={s.val}>{status?.totalCachedFiles ?? '—'}</span>
        </div>
        <div style={s.row}>
          <span style={s.label}><HardDrive size={12} /> Cache Size Used</span>
          <span style={s.val}>{status?.totalCachedGB ?? '—'} GB</span>
        </div>
        <div style={s.row}>
          <span style={s.label}><Zap size={12} /> Free on Cache Drive</span>
          <span style={{ ...s.val, color: warn ? 'var(--rose)' : 'var(--emerald)' }}>
            {status?.freeGB !== null && status?.freeGB !== undefined ? `${status.freeGB} GB` : 'N/A'}
          </span>
        </div>
      </div>

      {/* Per-drive stats */}
      {status?.driveStats?.length > 0 && (
        <div style={s.card}>
          <div style={s.sectionTitle}><HardDrive size={14} color="var(--violet)" /> Source Drives</div>
          {status.driveStats.map(d => {
            const drivePct = d.total > 0 ? Math.round((d.cached / d.total) * 100) : 0;
            const isSelected = selectedDrives.length === 0 || selectedDrives.includes(d.driveId);
            return (
              <div key={d.driveId} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-1)' }}>
                    <input
                      type="checkbox"
                      checked={selectedDrives.length === 0 || selectedDrives.includes(d.driveId)}
                      onChange={() => {
                        if (selectedDrives.length === 0) {
                          // Was "all selected" implicitly — now deselect this one
                          setSelectedDrives(status.driveStats.map(x => x.driveId).filter(id => id !== d.driveId));
                        } else {
                          toggleDrive(d.driveId);
                        }
                      }}
                      style={{ accentColor: 'var(--indigo)', width: 14, height: 14 }}
                    />
                    {d.name}
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                    {d.cached} / {d.total} videos cached
                  </span>
                </div>
                <ProgBar pct={drivePct} color="linear-gradient(90deg, var(--indigo), var(--violet))" />
              </div>
            );
          })}
        </div>
      )}

      {/* Job progress */}
      {(job?.running || job?.filesDone > 0) && (
        <div style={s.card}>
          <div style={s.sectionTitle}>
            {job?.running ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Converting…</> : <><CheckCircle2 size={13} color="var(--emerald)" /> Last Job</>}
          </div>
          {job?.currentFile && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📄 {job.currentFile}
            </div>
          )}
          <ProgBar pct={pct} color="linear-gradient(90deg, var(--cyan), var(--emerald))" />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-3)' }}>
            <span>{job?.filesDone} / {job?.filesTotal} videos</span>
            <span>{pct}%</span>
          </div>
          {job?.lastError && (
            <div style={{ fontSize: '0.75rem', color: 'var(--rose)', marginTop: 6 }}>⚠ {job.lastError}</div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {!job?.running ? (
          <button className="btn btn-primary" style={{ flex: 1, minWidth: 130 }} onClick={handleStart} disabled={!status?.cacheMountExists}>
            <Play size={14} /><span>Cache Selected Drives</span>
          </button>
        ) : (
          <>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handlePause}>
              {job?.paused ? <><Play size={14} /><span>Resume</span></> : <><Pause size={14} /><span>Pause</span></>}
            </button>
            <button className="btn" style={{ flex: 1, background: 'rgba(239,68,68,0.15)', color: 'var(--rose)', border: '1px solid rgba(239,68,68,0.3)' }} onClick={handleStop}>
              <Square size={14} /><span>Stop</span>
            </button>
          </>
        )}
        <button className="btn btn-ghost" style={{ padding: '0 12px' }} onClick={refresh} title="Refresh status">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Nightly schedule */}
      <div style={s.card}>
        <div style={s.sectionTitle}><Clock size={14} color="var(--amber)" /> Nightly Schedule</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.83rem', color: 'var(--text-1)' }}>
            <div
              style={{ width: 40, height: 22, borderRadius: 11, background: schedEnabled ? 'var(--indigo)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
              onClick={() => setSchedEnabled(e => !e)}
            >
              <div style={{ position: 'absolute', top: 3, left: schedEnabled ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
            Nightly Cache {schedEnabled ? 'ON' : 'OFF'}
          </label>
          <input
            type="time"
            value={schedTime}
            onChange={(e) => setSchedTime(e.target.value)}
            disabled={!schedEnabled}
            style={{ background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 8px', fontSize: '0.85rem', opacity: schedEnabled ? 1 : 0.5 }}
          />
        </div>
        <button className="btn btn-ghost" style={{ width: '100%', fontSize: '0.82rem' }} onClick={handleSchedule}>
          <CheckCircle2 size={13} /><span>Save Schedule</span>
        </button>
        {status?.nightlySchedule?.lastRun && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 8 }}>
            Last run: {new Date(status.nightlySchedule.lastRun).toLocaleString()}
          </div>
        )}
      </div>

      {/* Cached file list (collapsible) */}
      {status?.cachedList?.length > 0 && (
        <div style={s.card}>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-1)', padding: 0 }}
            onClick={() => setShowList(v => !v)}
          >
            <span style={s.sectionTitle}><Film size={14} color="var(--emerald)" /> Cached Videos ({status.cachedList.length})</span>
            {showList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showList && (
            <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 8 }}>
              {status.cachedList.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <CheckCircle2 size={11} color="var(--emerald)" style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{f.name}</span>
                  <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{f.cachedSize ? (f.cachedSize / 1e9).toFixed(1) + ' GB' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ffmpeg install note */}
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.7, padding: '8px 10px', background: 'rgba(0,0,0,0.15)', borderRadius: 6 }}>
        <strong style={{ color: 'var(--text-2)' }}>First time setup:</strong><br />
        On your Dell server, run:<br />
        <code style={{ color: 'var(--cyan)' }}>sudo apt install ffmpeg</code><br />
        Then set the cache drive path in <code>agent/.env</code>:<br />
        <code style={{ color: 'var(--cyan)' }}>CACHE_MOUNT=/mnt/hcdave-cache</code>
      </div>
    </div>
  );
}
