import React, { useState, useEffect } from 'react';
import { X, Globe, Check, ShieldCheck, RefreshCw, Activity, Cpu, Clock, Database, HardDrive, Edit2, AlertTriangle, Monitor } from 'lucide-react';
import { StorageService } from '../services/api';
import { CachePanel } from './CachePanel';
import { TerminalPanel } from './TerminalPanel';


export function SettingsModal({ onClose, onSave, drives }) {
  const [tab, setTab]               = useState('connection'); // 'connection' | 'cache' | 'drives'
  const [agentUrl, setAgentUrl]     = useState(StorageService.getAgentUrl());
  const [saved, setSaved]           = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMsg, setUpdateMsg]   = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [agentVersion, setAgentVersion] = useState('Checking...');
  const [localIp, setLocalIp]       = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [stats, setStats]           = useState(null);
  const [cacheWarn, setCacheWarn]   = useState(false);
  const [driveRoles, setDriveRoles] = useState({});
  const [renamingDriveId, setRenamingDriveId] = useState(null);
  const [newName, setNewName]       = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameMsg, setRenameMsg]   = useState('');
  const [showRenameConfirm, setShowRenameConfirm] = useState(false);
  
  const [isUpdatingScanner, setIsUpdatingScanner] = useState(false);
  const [scannerUpdateMsg, setScannerUpdateMsg]   = useState('');
  const [scannerVersion, setScannerVersion] = useState('Checking...');
  const [scannerLastUpdated, setScannerLastUpdated] = useState('');

  useEffect(() => {
    StorageService.getHealth().then(data => {
      setAgentVersion(data.version || 'unknown');
      setLocalIp(data.localIp || 'Unknown');
      setLastUpdated(data.lastUpdated || 'Unknown');
      if (data.scannerVersion) setScannerVersion(data.scannerVersion);
      if (data.scannerLastUpdated) setScannerLastUpdated(data.scannerLastUpdated);
      if (data.stats) setStats(data.stats);
    });
    // Check cache warning badge
    StorageService.getCacheStatus().then(cs => {
      setCacheWarn(cs.warn || false);
    }).catch(() => {});
    // Fetch drive roles
    StorageService.getDriveRoles().then(roles => {
      setDriveRoles(roles || {});
    });
  }, []);

  const handleSave = async () => {
    StorageService.setAgentUrl(agentUrl);
    await StorageService.updateDriveRoles(driveRoles);
    setSaved(true);
    setTimeout(() => { onSave(); onClose(); }, 800);
  };

  const triggerUpdate = async () => {
    setShowConfirm(false);
    try {
      setIsUpdating(true);
      setUpdateMsg('Pulling latest code from GitHub…');
      const res = await StorageService.updateAgent();
      setUpdateMsg(res.message || 'Update started. Waiting for server restart…');

      const poll = setInterval(async () => {
        try {
          const data = await StorageService.getHealth();
          if (data && data.version && data.version !== 'unknown' && data.version !== agentVersion) {
            clearInterval(poll);
            setAgentVersion(data.version);
            setLastUpdated(data.lastUpdated || 'Unknown');
            setUpdateMsg(`✅ Update complete! Running new version.\nLatest: ${data.lastUpdated || 'Unknown'}`);
            setIsUpdating(false);
          }
        } catch (_) {}
      }, 3000);
    } catch (e) {
      setUpdateMsg('❌ ' + (e.message || 'Update failed'));
      setIsUpdating(false);
    }
  };

  const triggerScannerUpdate = async () => {
    try {
      setIsUpdatingScanner(true);
      setScannerUpdateMsg('Starting update...');
      const res = await StorageService.updateScanner();
      setScannerUpdateMsg(res.message || 'Update started...');


      const poll = setInterval(async () => {
        try {
          const state = await StorageService.getScannerUpdateStatus();
          
          let statusText = '';
          if (state.status === 'installing') statusText = 'Installing dependencies (npm install)...';
          else if (state.status === 'building') statusText = 'Building scanner (takes ~3 mins)...';
          else if (state.status === 'restarting') statusText = 'Restarting service...';
          else if (state.status === 'success') {
            clearInterval(poll);
            setScannerUpdateMsg(`✅ Scanner updated successfully!\n\n${res.pullOutput || ''}`);
            StorageService.getHealth().then(data => {
              if (data.scannerVersion) setScannerVersion(data.scannerVersion);
              if (data.scannerLastUpdated) setScannerLastUpdated(data.scannerLastUpdated);
            });
            setIsUpdatingScanner(false);
            return;
          } else if (state.status === 'error') {
            clearInterval(poll);
            setScannerUpdateMsg(`❌ Update failed\n\n${state.error || ''}`);
            setIsUpdatingScanner(false);
            return;
          }
          
          if (statusText) {
            setScannerUpdateMsg(`${res.message}\n\n⏳ ${statusText}`);
          }
        } catch (_) {}
      }, 2000);
    } catch (e) {
      setScannerUpdateMsg('❌ ' + (e.message || 'Update request failed'));
      setIsUpdatingScanner(false);
    }
  };

  const executeRename = async () => {
    if (!renameTarget) return;
    setIsRenaming(true);
    setRenameMsg('Renaming drive and restarting server...');
    const res = await StorageService.renameDrive(renameTarget.oldMount, renameTarget.newName);
    if (res.error) {
      setRenameMsg('❌ ' + res.error);
      setIsRenaming(false);
    } else {
      setRenameMsg('✅ Rename successful! Reloading page...');
      setTimeout(() => window.location.reload(), 5000);
    }
  };

  const TABS = [
    { key: 'connection', label: 'Connection', Icon: Globe },
    { key: 'drives',     label: 'Drives',     Icon: HardDrive },
    { key: 'cache',      label: 'Video Cache', Icon: Database, badge: cacheWarn },
    { key: 'terminal',   label: '🖥 Terminal',  Icon: Monitor },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>

      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)} style={{ zIndex: 1000, background: 'rgba(0,0,0,0.8)' }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 320, animation: 'scaleIn 0.2s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ background: 'rgba(99,102,241,0.1)', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <RefreshCw size={32} color="var(--indigo)" />
              </div>
              <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-1)' }}>Update Server</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                This will download the latest software to your Home Server and restart the backend.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={triggerUpdate}>Update Now</button>
            </div>
          </div>
        </div>
      )}

      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-title-row">
          <div className="modal-title">Settings</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 4 }}>
          {TABS.map(({ key, label, Icon, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                background: tab === key ? 'var(--bg-card)' : 'transparent',
                color: tab === key ? 'var(--text-1)' : 'var(--text-3)',
                position: 'relative', transition: 'all 0.15s',
              }}
            >
              <Icon size={13} />
              {label}
              {badge && (
                <span style={{ position: 'absolute', top: 5, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--rose)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Connection Tab */}
        {tab === 'connection' && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="agent-url-input">
                <Globe size={12} /><span>Home Storage Agent URL</span>
              </label>
              <input
                id="agent-url-input" name="agentUrl" type="url" className="field-input"
                value={agentUrl}
                onChange={(e) => { setAgentUrl(e.target.value); setSaved(false); }}
                placeholder="https://api.hcdavecloud.in"
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 8 }}>
                Your Cloudflare Tunnel URL (e.g. <code style={{ color: 'var(--cyan)' }}>https://api.hcdavecloud.in</code>)
              </div>
            </div>

            <div style={{ padding: '14px', background: 'rgba(99,102,241,0.07)', borderRadius: 'var(--r-sm)', border: '1px solid rgba(99,102,241,0.18)', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>
                <ShieldCheck size={15} color="var(--emerald)" /><span>Plug &amp; Play Auto-Detection</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
                Any USB HDD, SSD, or Flash Drive plugged into your server is automatically detected and served without any extra configuration.
              </div>
            </div>

            <div style={{ padding: '14px', background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem' }}>
                  <RefreshCw size={15} color="var(--text-1)" /><span>Server Updates</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', gap: 12 }}>
                  {localIp && <span>SSH IP: <strong style={{ color: 'var(--cyan)' }}>{localIp}</strong></span>}
                  <span>Version: <strong style={{ color: 'var(--cyan)' }}>v{agentVersion}</strong></span>
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 12 }}>
                Last Git Update: <strong style={{ color: 'var(--text-2)' }}>{lastUpdated}</strong>
              </div>
              {stats && (
                <div style={{ display: 'flex', gap: 15, fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 12, padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Activity size={12} /> CPU: <strong style={{ color: 'var(--cyan)' }}>{stats.load}</strong></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Cpu size={12} /> RAM: <strong style={{ color: 'var(--cyan)' }}>{stats.memUsage}%</strong></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={12} /> Up: <strong style={{ color: 'var(--cyan)' }}>{stats.uptimeHours}h</strong></div>
                </div>
              )}
              <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 }}>
                Pull the latest code from GitHub to your Home Server and restart the background agent without needing a monitor.
              </div>
              <button
                className="btn"
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={() => setShowConfirm(true)}
                disabled={isUpdating}
              >
                {isUpdating ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
                <span>{isUpdating ? 'Updating...' : 'Update Agent Software'}</span>
              </button>
              {updateMsg && (
                <div style={{ fontSize: '0.75rem', marginTop: 10, color: updateMsg.includes('❌') ? 'var(--rose)' : 'var(--emerald)', whiteSpace: 'pre-wrap' }}>
                  {updateMsg}
                </div>
              )}
            </div>

            <div style={{ padding: '14px', background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem', marginBottom: 8 }}>
                <RefreshCw size={15} color="var(--text-1)" /><span>Scanner Updates</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 4 }}>
                Version: <strong style={{ color: 'var(--text-1)' }}>{scannerVersion}</strong>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 12 }}>
                Last Git Update: <strong style={{ color: 'var(--text-2)' }}>{scannerLastUpdated}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 }}>
                Pull the latest code from GitHub, build the WASM, and restart the scanner service.
              </div>
              <button
                className="btn"
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={triggerScannerUpdate}
                disabled={isUpdatingScanner}
              >
                {isUpdatingScanner ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
                <span>{isUpdatingScanner ? 'Updating...' : 'Update Scanner Software'}</span>
              </button>
              {scannerUpdateMsg && (
                <div style={{ fontSize: '0.75rem', marginTop: 10, color: scannerUpdateMsg.includes('❌') ? 'var(--rose)' : (scannerUpdateMsg.includes('✅') ? 'var(--emerald)' : 'var(--cyan)'), whiteSpace: 'pre-wrap' }}>
                  {scannerUpdateMsg}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                <Check size={16} /><span>{saved ? 'Saved!' : 'Save & Reconnect'}</span>
              </button>
            </div>
          </>
        )}

        {/* Cache Tab */}
        {tab === 'cache' && <CachePanel drives={drives} />}

        {/* Terminal Tab */}
        {tab === 'terminal' && <TerminalPanel />}

        {/* Drives Tab */}
        {tab === 'drives' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '14px', background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 15 }}>Drive Roles Configuration</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: 20 }}>
                Assign permanent roles to your plugged-in drives. HC Cloud identifies drives by their unique hardware UUID, so these roles will persist across reboots and USB port changes.
              </div>
              
              {drives.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>No drives detected.</div>
              ) : (
                [...drives].sort((a, b) => {
                  const roleA = driveRoles[a.uuid || a.id] || '';
                  const roleB = driveRoles[b.uuid || b.id] || '';
                  const roleOrder = { 'Master': 1, 'Gallery': 2, 'Portable': 3, 'Backup': 4, 'Cache': 5, 'Storage': 6, '': 7 };
                  return (roleOrder[roleA] || 99) - (roleOrder[roleB] || 99);
                }).map(d => (
                    <div key={d.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          {renamingDriveId === d.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <input
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="New name..."
                                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-1)', color: 'white', outline: 'none', fontSize: '0.85rem' }}
                              />
                              <button className="btn btn-primary" style={{ padding: '4px 8px' }} onClick={() => {
                                if (!newName || newName === d.name) { setRenamingDriveId(null); return; }
                                setRenameTarget({ oldName: d.name, oldMount: d.mount, newName });
                                setShowRenameConfirm(true);
                              }}>Save</button>
                              <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setRenamingDriveId(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-1)' }}>{d.name}</div>
                              <button className="btn btn-ghost" style={{ padding: '4px', opacity: 0.6 }} onClick={() => { setRenamingDriveId(d.id); setNewName(d.name); }} title="Rename physical drive">
                                <Edit2 size={14} />
                              </button>
                            </div>
                          )}
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 2 }}>{d.uuid || d.id} • {d.totalGB} GB</div>
                        </div>
                        <select
                      value={driveRoles[d.uuid || d.id] || ''}
                      onChange={e => setDriveRoles({ ...driveRoles, [d.uuid || d.id]: e.target.value })}
                      style={{
                        padding: '6px 12px',
                        background: 'var(--bg-1)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-1)',
                        borderRadius: 6,
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="" style={{ background: '#1e1e1e', color: '#fff' }}>None</option>
                      <option value="Master" style={{ background: '#1e1e1e', color: '#fff' }}>Master</option>
                      <option value="Gallery" style={{ background: '#1e1e1e', color: '#fff' }}>Gallery</option>
                        <option value="Portable" style={{ background: '#1e1e1e', color: '#fff' }}>Portable</option>
                        <option value="Backup" style={{ background: '#1e1e1e', color: '#fff' }}>Backup</option>
                        <option value="Cache" style={{ background: '#1e1e1e', color: '#fff' }}>Cache</option>
                        <option value="Storage" style={{ background: '#1e1e1e', color: '#fff' }}>Storage</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                <Check size={16} /><span>{saved ? 'Saved!' : 'Save Drive Roles'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showRenameConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ 
            background: '#1e1e2e', 
            padding: '32px', 
            borderRadius: '16px', 
            maxWidth: '420px', 
            width: '90%', 
            border: '1px solid rgba(255, 255, 255, 0.1)', 
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#f59e0b', marginBottom: 20 }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={28} />
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>Restart Required</div>
            </div>
            
            <div style={{ fontSize: '0.95rem', color: '#e2e8f0', lineHeight: 1.6, marginBottom: 24 }}>
              Renaming <strong style={{ color: '#ffffff', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>{renameTarget?.oldName}</strong> to <strong style={{ color: '#22d3ee', background: 'rgba(34, 211, 238, 0.1)', padding: '2px 6px', borderRadius: 4 }}>{renameTarget?.newName}</strong> requires rebooting the storage service.
              
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(244, 63, 94, 0.1)', borderLeft: '4px solid #f43f5e', borderRadius: '4px', color: '#fda4af', fontSize: '0.85rem', lineHeight: 1.5 }}>
                <strong style={{ color: '#f43f5e' }}>Warning:</strong> Any active file transfers or video conversions will be abruptly stopped.
              </div>
            </div>
            
            {renameMsg && (
              <div style={{ padding: '12px 16px', background: renameMsg.includes('❌') ? 'rgba(244, 63, 94, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: '1px solid', borderColor: renameMsg.includes('❌') ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)', borderRadius: '8px', marginBottom: 24, fontSize: '0.9rem', color: renameMsg.includes('❌') ? '#fda4af' : '#6ee7b7' }}>
                {renameMsg}
              </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 32 }}>
              <button 
                onClick={() => { setShowRenameConfirm(false); setRenameTarget(null); setRenameMsg(''); }} 
                disabled={isRenaming}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#ffffff', cursor: isRenaming ? 'not-allowed' : 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.05)'}
                onMouseOut={e => e.target.style.background = 'transparent'}
              >
                Cancel
              </button>
              <button 
                onClick={executeRename} 
                disabled={isRenaming}
                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#f43f5e', color: '#ffffff', cursor: isRenaming ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(244, 63, 94, 0.3)' }}
                onMouseOver={e => !isRenaming && (e.target.style.background = '#e11d48')}
                onMouseOut={e => !isRenaming && (e.target.style.background = '#f43f5e')}
              >
                {isRenaming ? <RefreshCw size={18} className="spin" /> : <Edit2 size={18} />}
                <span>{isRenaming ? 'Renaming...' : 'Rename & Restart'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
