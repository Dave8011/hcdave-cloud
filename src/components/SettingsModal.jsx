import React, { useState, useEffect } from 'react';
import {
  X, Globe, Check, ShieldCheck, RefreshCw, Activity, Cpu, Clock,
  Database, HardDrive, Edit2, AlertTriangle, Monitor, Server, Archive, Trash2,
  ChevronRight, Sparkles
} from 'lucide-react';
import { StorageService } from '../services/api';
import { CachePanel } from './CachePanel';
import { TerminalPanel } from './TerminalPanel';
import { SystemHealthPanel } from './SystemHealthPanel';
import { BackupPanel } from './BackupPanel';
import { RecycleBinPanel } from './RecycleBinPanel';

const TAB_GROUPS = [
  {
    group: 'System',
    items: [
      { key: 'dashboard', label: 'Dashboard', desc: 'Live system metrics & services health', Icon: Server },
      { key: 'connection', label: 'Connection', desc: 'Cloudflare tunnel URL & updates', Icon: Globe },
      { key: 'terminal', label: 'Terminal', desc: 'Root terminal & system diagnostics', Icon: Monitor },
    ]
  },
  {
    group: 'Storage',
    items: [
      { key: 'drives', label: 'Drives', desc: 'Hardware UUIDs, roles & renaming', Icon: HardDrive },
      { key: 'cache', label: 'Video Cache', desc: 'Background video conversion & cache', Icon: Database, hasBadge: true },
      { key: 'trash', label: 'Recycle Bin', desc: 'Deleted file retention & recovery', Icon: Trash2 },
    ]
  },
  {
    group: 'Automation',
    items: [
      { key: 'backup', label: 'Backup', desc: 'Automated nightly drive compression', Icon: Archive },
    ]
  }
];

export function SettingsModal({ onClose, onSave, drives, initialTab = 'dashboard' }) {
  const [tab, setTab]               = useState(initialTab);
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

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Find active tab info
  const allTabs = TAB_GROUPS.flatMap(g => g.items);
  const activeTabMeta = allTabs.find(t => t.key === tab) || allTabs[0];

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      {/* Update confirmation dialog */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)} style={{ zIndex: 1200, background: 'rgba(0,0,0,0.85)' }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340, animation: 'scaleIn 0.2s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ background: 'rgba(99,102,241,0.12)', width: 60, height: 60, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <RefreshCw size={28} color="var(--indigo)" />
              </div>
              <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-1)' }}>Update Server</h3>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                This will pull the latest code from GitHub to your Home Server and restart the backend agent.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={triggerUpdate}>Update Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Settings Modal Box */}
      <div className="settings-modal-wrapper" onClick={(e) => e.stopPropagation()}>
        {/* Desktop Left Sidebar */}
        <aside className="settings-modal-sidebar">
          <div className="settings-sidebar-header">
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Server size={15} color="var(--cyan)" />
                Settings &amp; System
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>
                v{agentVersion} · <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>Active</span>
              </div>
            </div>
          </div>

          <div className="settings-sidebar-nav">
            {TAB_GROUPS.map((group) => (
              <div key={group.group}>
                <div className="settings-nav-group-title">{group.group}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {group.items.map((item) => {
                    const Icon = item.Icon;
                    const isActive = tab === item.key;
                    const showBadge = item.hasBadge && cacheWarn;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={`settings-nav-button ${isActive ? 'active' : ''}`}
                        onClick={() => setTab(item.key)}
                      >
                        <Icon size={16} color={isActive ? 'var(--cyan)' : 'var(--text-2)'} />
                        <span>{item.label}</span>
                        {showBadge && (
                          <span style={{
                            marginLeft: 'auto',
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: 'var(--rose)'
                          }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="settings-modal-content">
          {/* Header Row */}
          <div className="settings-content-header">
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <activeTabMeta.Icon size={18} color="var(--cyan)" />
                {activeTabMeta.label}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2 }}>
                {activeTabMeta.desc}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-2)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: 8,
                display: 'flex',
                transition: 'all 0.15s'
              }}
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Mobile Tab Pills Bar (visible on screens <= 768px) */}
          <div className="settings-modal-mobile-nav">
            {allTabs.map((item) => {
              const Icon = item.Icon;
              const isActive = tab === item.key;
              const showBadge = item.hasBadge && cacheWarn;

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`settings-mobile-pill ${isActive ? 'active' : ''}`}
                  onClick={() => setTab(item.key)}
                >
                  <Icon size={14} color={isActive ? 'var(--cyan)' : 'var(--text-2)'} />
                  <span>{item.label}</span>
                  {showBadge && (
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--rose)'
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Body Content by Tab */}
          <div className="settings-content-body">
            {/* Dashboard Tab */}
            {tab === 'dashboard' && <SystemHealthPanel />}

            {/* Terminal Tab */}
            {tab === 'terminal' && <TerminalPanel />}

            {/* Video Cache Tab */}
            {tab === 'cache' && <CachePanel drives={drives} />}

            {/* Backup Tab */}
            {tab === 'backup' && <BackupPanel drives={drives || []} />}

            {/* Recycle Bin Tab */}
            {tab === 'trash' && <RecycleBinPanel drives={drives || []} activeDriveId={drives?.[0]?.id} />}

            {/* Connection Tab */}
            {tab === 'connection' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Agent URL Card */}
                <div className="settings-card">
                  <div className="settings-card-title">
                    <Globe size={16} color="var(--cyan)" />
                    <span>Home Storage Agent URL</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 10 }}>
                    Your Cloudflare Tunnel URL or local IP address for this server.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      id="agent-url-input"
                      name="agentUrl"
                      type="url"
                      className="field-input"
                      value={agentUrl}
                      onChange={(e) => { setAgentUrl(e.target.value); setSaved(false); }}
                      placeholder="https://api.hcdavecloud.in"
                      style={{ flex: 1, minWidth: 240 }}
                    />
                    <button className="btn btn-primary" onClick={handleSave} style={{ whiteSpace: 'nowrap' }}>
                      <Check size={15} />
                      <span>{saved ? 'Saved!' : 'Save URL'}</span>
                    </button>
                  </div>
                </div>

                {/* Auto Detection Card */}
                <div className="settings-card" style={{ background: 'rgba(99, 102, 241, 0.05)', borderColor: 'rgba(99, 102, 241, 0.2)' }}>
                  <div className="settings-card-title">
                    <ShieldCheck size={16} color="var(--emerald)" />
                    <span>Plug &amp; Play Auto-Detection</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
                    USB hard drives, portable SSDs, and flash drives plugged into your home server are automatically mounted and served without requiring manual configuration.
                  </div>
                </div>

                {/* Server Updates Card */}
                <div className="settings-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                    <div className="settings-card-title" style={{ margin: 0 }}>
                      <RefreshCw size={16} color="var(--indigo)" />
                      <span>Server Agent Updates</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', display: 'flex', gap: 12 }}>
                      {localIp && <span>IP: <strong style={{ color: 'var(--cyan)' }}>{localIp}</strong></span>}
                      <span>Version: <strong style={{ color: 'var(--cyan)' }}>v{agentVersion}</strong></span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 12 }}>
                    Last Git Update: <strong style={{ color: 'var(--text-2)' }}>{lastUpdated}</strong>
                  </div>

                  {stats && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      fontSize: '0.75rem',
                      color: 'var(--text-3)',
                      marginBottom: 14,
                      padding: '10px 14px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Activity size={12} color="var(--cyan)" /> CPU: <strong style={{ color: 'var(--text-1)' }}>{stats.load}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Cpu size={12} color="var(--violet)" /> RAM: <strong style={{ color: 'var(--text-1)' }}>{stats.memUsage}%</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={12} color="var(--emerald)" /> Uptime: <strong style={{ color: 'var(--text-1)' }}>{stats.uptimeHours}h</strong>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 14 }}>
                    Pulls latest changes from the git repository, runs package installation, and restarts the backend agent without needing an external monitor.
                  </div>

                  <button
                    className="btn"
                    style={{
                      width: '100%',
                      background: 'rgba(99, 102, 241, 0.1)',
                      color: '#fff',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      padding: '10px'
                    }}
                    onClick={() => setShowConfirm(true)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
                    <span>{isUpdating ? 'Updating Server Software...' : 'Update Agent Software'}</span>
                  </button>

                  {updateMsg && (
                    <div style={{
                      fontSize: '0.78rem',
                      marginTop: 10,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: updateMsg.includes('❌') ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)',
                      color: updateMsg.includes('❌') ? 'var(--rose)' : 'var(--emerald)',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {updateMsg}
                    </div>
                  )}
                </div>

                {/* Scanner Updates Card */}
                <div className="settings-card">
                  <div className="settings-card-title">
                    <RefreshCw size={16} color="var(--amber)" />
                    <span>Scanner Module Updates</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 4 }}>
                    Version: <strong style={{ color: 'var(--text-1)' }}>{scannerVersion}</strong> · Last Git: <strong style={{ color: 'var(--text-2)' }}>{scannerLastUpdated}</strong>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.6, margin: '8px 0 14px' }}>
                    Rebuilds the OCR WASM pipeline and restarts the high-speed scanner service at scanner.hcdavecloud.in.
                  </div>

                  <button
                    className="btn"
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'var(--text-1)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      padding: '10px'
                    }}
                    onClick={triggerScannerUpdate}
                    disabled={isUpdatingScanner}
                  >
                    {isUpdatingScanner ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
                    <span>{isUpdatingScanner ? 'Updating Scanner Software...' : 'Update Scanner Software'}</span>
                  </button>

                  {scannerUpdateMsg && (
                    <div style={{
                      fontSize: '0.78rem',
                      marginTop: 10,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: scannerUpdateMsg.includes('❌') ? 'rgba(244,63,94,0.1)' : 'rgba(34,211,238,0.1)',
                      color: scannerUpdateMsg.includes('❌') ? 'var(--rose)' : (scannerUpdateMsg.includes('✅') ? 'var(--emerald)' : 'var(--cyan)'),
                      whiteSpace: 'pre-wrap'
                    }}>
                      {scannerUpdateMsg}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Drives Tab */}
            {tab === 'drives' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="settings-card">
                  <div className="settings-card-title">
                    <HardDrive size={16} color="var(--indigo)" />
                    <span>Permanent Drive Roles &amp; Renaming</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
                    Assign permanent roles (Master, Gallery, Portable, Backup, Cache, Storage) to your plugged-in drives. HC Cloud remembers each drive by its unique hardware UUID, persisting through reboots and USB port changes.
                  </div>

                  {drives.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-3)', padding: '16px 0', textAlign: 'center' }}>
                      No physical drives detected on the server.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[...drives].sort((a, b) => {
                        const roleA = driveRoles[a.uuid || a.id] || '';
                        const roleB = driveRoles[b.uuid || b.id] || '';
                        const roleOrder = { 'Master': 1, 'Gallery': 2, 'Portable': 3, 'Backup': 4, 'Cache': 5, 'Storage': 6, '': 7 };
                        return (roleOrder[roleA] || 99) - (roleOrder[roleB] || 99);
                      }).map((d) => (
                        <div
                          key={d.id}
                          style={{
                            padding: '12px 14px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 10
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 200 }}>
                            {renamingDriveId === d.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <input
                                  type="text"
                                  value={newName}
                                  onChange={e => setNewName(e.target.value)}
                                  placeholder="New name..."
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-1)',
                                    color: '#fff',
                                    outline: 'none',
                                    fontSize: '0.85rem'
                                  }}
                                />
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                                  onClick={() => {
                                    if (!newName || newName === d.name) { setRenamingDriveId(null); return; }
                                    setRenameTarget({ oldName: d.name, oldMount: d.mount, newName });
                                    setShowRenameConfirm(true);
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                                  onClick={() => setRenamingDriveId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#fff' }}>{d.name}</div>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ padding: '4px 6px', opacity: 0.7 }}
                                  onClick={() => { setRenamingDriveId(d.id); setNewName(d.name); }}
                                  title="Rename physical drive"
                                >
                                  <Edit2 size={13} />
                                </button>
                              </div>
                            )}
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 3 }}>
                              {d.uuid || d.id} · {d.totalGB} GB {d.type}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Role:</span>
                            <select
                              className="custom-select custom-select-sm"
                              aria-label={`Role for drive ${d.name}`}
                              value={driveRoles[d.uuid || d.id] || ''}
                              onChange={e => setDriveRoles({ ...driveRoles, [d.uuid || d.id]: e.target.value })}
                            >
                              <option value="">None</option>
                              <option value="Master">Master</option>
                              <option value="Gallery">Gallery</option>
                              <option value="Portable">Portable</option>
                              <option value="Backup">Backup</option>
                              <option value="Cache">Cache</option>
                              <option value="Storage">Storage</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave}>
                      <Check size={16} />
                      <span>{saved ? 'Saved!' : 'Save Drive Roles'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Rename Confirmation Modal */}
      {showRenameConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(4px)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{
            background: '#1a1f2c',
            padding: '28px',
            borderRadius: '16px',
            maxWidth: '440px',
            width: '100%',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#f59e0b', marginBottom: 16 }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={24} />
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>Restart Required</div>
            </div>

            <div style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.6, marginBottom: 20 }}>
              Renaming <strong style={{ color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>{renameTarget?.oldName}</strong> to <strong style={{ color: '#22d3ee', background: 'rgba(34, 211, 238, 0.1)', padding: '2px 6px', borderRadius: 4 }}>{renameTarget?.newName}</strong> requires rebooting the storage service.

              <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(244, 63, 94, 0.1)', borderLeft: '4px solid #f43f5e', borderRadius: '4px', color: '#fda4af', fontSize: '0.82rem', lineHeight: 1.5 }}>
                <strong style={{ color: '#f43f5e' }}>Warning:</strong> Active file transfers or background video caching will be restarted.
              </div>
            </div>

            {renameMsg && (
              <div style={{
                padding: '10px 14px',
                background: renameMsg.includes('❌') ? 'rgba(244, 63, 94, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                border: '1px solid',
                borderColor: renameMsg.includes('❌') ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                marginBottom: 20,
                fontSize: '0.85rem',
                color: renameMsg.includes('❌') ? '#fda4af' : '#6ee7b7'
              }}>
                {renameMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn btn-ghost"
                onClick={() => { setShowRenameConfirm(false); setRenameTarget(null); setRenameMsg(''); }}
                disabled={isRenaming}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: '#f43f5e', borderColor: '#f43f5e' }}
                onClick={executeRename}
                disabled={isRenaming}
              >
                {isRenaming ? <RefreshCw size={15} className="spin" /> : <Edit2 size={15} />}
                <span>{isRenaming ? 'Renaming...' : 'Rename & Restart'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
