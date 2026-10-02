import React from 'react';
import { HardDrive, Cpu, Folder, ShieldCheck, Wifi, PlugZap, Database } from 'lucide-react';

export function Sidebar({ drives, activeDriveId, setActiveDriveId, activeTab, setActiveTab, isOpen, onCacheDrive, driveStats }) {
  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      <div>
        {/* Brand */}
        <div className="brand">
          <div className="brand-icon">
            <Wifi size={20} />
          </div>
          <div>
            <div className="brand-name">HC Dave Cloud</div>
            <div className="brand-domain">hcdavecloud.in</div>
          </div>
        </div>

        {/* Connected Drives */}
        <div className="drives-section">
          <div className="section-label">
            <span>Storage Drives</span>
            <span style={{ color: 'var(--cyan)', fontWeight: 700, letterSpacing: '0.04em' }}>
              {drives.length} detected
            </span>
          </div>

          {drives.length === 0 ? (
            <div className="no-drives">
              <PlugZap size={28} style={{ marginBottom: 10, color: 'var(--text-3)' }} />
              <div>No drives detected.</div>
              <div>Plug in a USB HDD or SSD and refresh the page.</div>
            </div>
          ) : (
            [...drives].sort((a, b) => {
              const roleOrder = { 'Master': 1, 'Gallery': 2, 'Portable': 3, 'Backup': 4, 'Cache': 5 };
              return (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99);
            }).map((drive, i) => {
              const pct = Math.min(100, Math.round((drive.usedGB / drive.totalGB) * 100));
              const isActive = drive.id === activeDriveId;
              const isSSD = drive.type === 'SSD';

              return (
                <div
                  key={drive.id}
                  className={`drive-card ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveDriveId(drive.id)}
                  style={{ animationDelay: `${i * 0.06}s` }}
                >
                  <div className="drive-header">
                    <div className="drive-info">
                      <span className="drive-icon-wrap">
                        {isSSD
                          ? <Cpu size={17} />
                          : <HardDrive size={17} />
                        }
                      </span>
                      <span className="drive-label">{drive.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {drive.role && (
                        <span className="drive-tag" style={{ background: 'var(--indigo)', color: 'white', border: 'none' }}>
                          {drive.role}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="prog-bg">
                    <div
                      className="prog-fill"
                      style={{
                        width: `${pct}%`,
                        background: isSSD
                          ? 'linear-gradient(90deg, var(--cyan), var(--emerald))'
                          : 'linear-gradient(90deg, var(--indigo), var(--violet))'
                      }}
                    />
                  </div>

                  <div className="drive-meta">
                    <span>{drive.usedGB} GB used</span>
                    <span>{drive.freeGB} GB free · {drive.totalGB} GB</span>
                  </div>

                  {/* Cache stats + button */}
                  {(() => {
                    const ds = driveStats?.find(d => d.driveId === drive.id);
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
                          {ds ? `${ds.cached}/${ds.total} cached` : 'Cache: —'}
                        </span>
                        {onCacheDrive && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onCacheDrive(drive.id); }}
                            style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 4, padding: '2px 7px', color: 'var(--indigo)', cursor: 'pointer', fontWeight: 600 }}
                            title="Cache all videos on this drive"
                          >
                            <Database size={10} /> Cache Drive
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

        {/* Navigation */}
        <div className="section-label" style={{ marginTop: 8 }}>Browse</div>
        <nav className="nav-menu">
          <div
            className={`nav-item ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <Folder size={17} />
            <span>All Files</span>
          </div>
        </nav>
      </div>

      {/* Connection status */}
      <div className="conn-pill">
        <div className="flex items-center">
          <div className="conn-dot" />
          <span className="conn-label">Cloudflare Active</span>
        </div>
        <ShieldCheck size={15} color="var(--emerald)" />
      </div>
    </aside>
  );
}
