import React from 'react';
import {
  HardDrive, Cpu, Folder, ShieldCheck, Wifi, PlugZap, Database,
  Activity, Archive, Trash2, Terminal, Search, ExternalLink
} from 'lucide-react';

export function Sidebar({
  drives,
  activeDriveId,
  setActiveDriveId,
  activeTab,
  setActiveTab,
  isOpen,
  onCacheDrive,
  driveStats,
  onOpenDashboard,
  onOpenBackup,
  onOpenTrash,
  onOpenTerminal,
  onOpenSearch
}) {
  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      <div>
        {/* Brand Header */}
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-icon" style={{
            position: 'relative',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(34,211,238,0.2) 100%)',
            border: '1px solid rgba(99,102,241,0.3)',
            boxShadow: '0 0 16px rgba(99,102,241,0.15)'
          }}>
            <Wifi size={20} color="var(--cyan)" />
            <span style={{
              position: 'absolute',
              bottom: -1,
              right: -1,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--emerald)',
              boxShadow: '0 0 8px var(--emerald)'
            }} />
          </div>
          <div>
            <div className="brand-name" style={{ letterSpacing: '-0.01em', fontWeight: 700 }}>
              HC Dave Cloud
            </div>
            <div className="brand-domain" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-3)' }}>
              <span>hcdavecloud.in</span>
              <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 999, background: 'rgba(16,185,129,0.12)', color: 'var(--emerald)', fontWeight: 700 }}>
                LIVE
              </span>
            </div>
          </div>
        </div>

        {/* Storage Drives Section */}
        <div className="drives-section">
          <div className="section-label">
            <span>Storage Drives</span>
            <span style={{ color: 'var(--cyan)', fontWeight: 700, letterSpacing: '0.04em' }}>
              {drives.length} detected
            </span>
          </div>

          {drives.length === 0 ? (
            <div className="no-drives" style={{
              padding: '24px 16px',
              textAlign: 'center',
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.08)',
              borderRadius: 12
            }}>
              <PlugZap size={28} style={{ marginBottom: 10, color: 'var(--text-3)' }} />
              <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>No drives detected</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', lineHeight: 1.5 }}>
                Plug in a USB HDD, SSD, or Flash drive to automatically serve files.
              </div>
            </div>
          ) : (
            [...drives].sort((a, b) => {
              const roleOrder = { 'Master': 1, 'Gallery': 2, 'Portable': 3, 'Backup': 4, 'Cache': 5, 'Storage': 6 };
              return (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99);
            }).map((drive, i) => {
              const pct = Math.min(100, Math.round((drive.usedGB / drive.totalGB) * 100)) || 0;
              const isActive = drive.id === activeDriveId;

              const roleColors = {
                Master:   'var(--rose)',
                Gallery:  'var(--amber)',
                Portable: 'var(--cyan)',
                Backup:   'var(--emerald)',
                Cache:    'var(--indigo)',
                Storage:  'var(--violet)'
              };
              const badgeColor = roleColors[drive.role] || 'var(--indigo)';

              return (
                <div
                  key={drive.id}
                  className={`drive-card ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveDriveId(drive.id)}
                  style={{
                    animationDelay: `${i * 0.05}s`,
                    padding: '12px 14px',
                    borderRadius: 12,
                    marginBottom: 8,
                    cursor: 'pointer'
                  }}
                >
                  <div className="drive-header" style={{ marginBottom: 8 }}>
                    <div className="drive-info">
                      <span className="drive-icon-wrap" style={{
                        background: isActive ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.05)',
                        color: isActive ? 'var(--cyan)' : 'var(--text-2)'
                      }}>
                        <HardDrive size={16} />
                      </span>
                      <span className="drive-label" style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                        {drive.name}
                      </span>
                    </div>
                    {drive.role && (
                      <span
                        className="drive-tag"
                        style={{
                          background: badgeColor,
                          color: '#fff',
                          border: 'none',
                          fontWeight: 700,
                          fontSize: '0.68rem',
                          padding: '2px 7px',
                          borderRadius: 4
                        }}
                      >
                        {drive.role}
                      </span>
                    )}
                  </div>

                  <div className="prog-bg" style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)' }}>
                    <div
                      className="prog-fill"
                      style={{
                        width: `${pct}%`,
                        borderRadius: 999,
                        background: pct >= 90
                          ? 'var(--rose)'
                          : pct >= 75
                            ? 'var(--amber)'
                            : 'linear-gradient(90deg, var(--indigo), var(--cyan))'
                      }}
                    />
                  </div>

                  <div className="drive-meta" style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-3)' }}>
                    <span>{drive.usedGB} GB used ({pct}%)</span>
                    <span>{drive.freeGB} GB free</span>
                  </div>

                  {/* Cache info & quick action */}
                  {(() => {
                    const ds = driveStats?.find(d => d.driveId === drive.id);
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
                          {ds ? `${ds.cached}/${ds.total} cached` : `${drive.type || 'Drive'}`}
                        </span>
                        {onCacheDrive && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onCacheDrive(drive.id); }}
                            style={{
                              fontSize: '0.68rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'rgba(99,102,241,0.12)',
                              border: '1px solid rgba(99,102,241,0.25)',
                              borderRadius: 5,
                              padding: '2px 8px',
                              color: 'var(--indigo)',
                              cursor: 'pointer',
                              fontWeight: 600,
                              transition: 'all 0.15s ease'
                            }}
                            title="Cache all videos on this drive for instant playback"
                          >
                            <Database size={11} />
                            <span>Cache</span>
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })
          )}
        </div>

        {/* Tools & Management Navigation */}
        <div className="section-label" style={{ marginTop: 12 }}>
          Tools &amp; Management
        </div>

        <nav className="nav-menu" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* All Files Nav */}
          <div
            className={`nav-item ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <Folder size={17} color="var(--amber)" />
            <span>All Files</span>
          </div>

          {/* Global Multi-Drive Search Nav */}
          {onOpenSearch && (
            <div
              className="nav-item"
              onClick={onOpenSearch}
              title="Search across all connected drives (Ctrl+K)"
            >
              <Search size={17} color="var(--cyan)" />
              <span>Global Search</span>
              <span className="hide-mobile" style={{
                marginLeft: 'auto',
                fontSize: '0.65rem',
                padding: '1px 5px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.08)',
                color: 'var(--text-3)',
                fontWeight: 600
              }}>
                ⌘K
              </span>
            </div>
          )}

          {/* Live Server Health Dashboard */}
          {onOpenDashboard && (
            <div
              className="nav-item"
              onClick={onOpenDashboard}
              title="Live Server Health Dashboard"
            >
              <Activity size={17} color="var(--cyan)" />
              <span>Health Dashboard</span>
            </div>
          )}

          {/* Drive Backups */}
          {onOpenBackup && (
            <div
              className="nav-item"
              onClick={onOpenBackup}
              title="Automatic Drive Compression Backup"
            >
              <Archive size={17} color="var(--violet)" />
              <span>Drive Backups</span>
            </div>
          )}

          {/* Recycle Bin */}
          {onOpenTrash && (
            <div
              className="nav-item"
              onClick={onOpenTrash}
              title="Recycle Bin &amp; File Recovery"
            >
              <Trash2 size={17} color="var(--rose)" />
              <span>Recycle Bin</span>
            </div>
          )}

          {/* Terminal */}
          {onOpenTerminal && (
            <div
              className="nav-item"
              onClick={onOpenTerminal}
              title="Administrator Terminal"
            >
              <Terminal size={17} color="var(--emerald)" />
              <span>Terminal</span>
            </div>
          )}
        </nav>
      </div>

      {/* Cloudflare Connection Pill */}
      <div
        className="conn-pill"
        onClick={onOpenDashboard}
        style={{ cursor: onOpenDashboard ? 'pointer' : 'default', padding: '10px 14px', borderRadius: 10 }}
        title="Click to view Live Server Health"
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <div className="conn-dot" />
          <span className="conn-label" style={{ fontWeight: 600 }}>Cloudflare Active</span>
        </div>
        <ShieldCheck size={16} color="var(--emerald)" />
      </div>
    </aside>
  );
}
