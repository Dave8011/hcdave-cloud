import React from 'react';
import { HardDrive, Cpu, Folder, Clock, Star, ShieldCheck, Wifi, PlugZap } from 'lucide-react';

export function Sidebar({ drives, activeDriveId, setActiveDriveId, activeTab, setActiveTab }) {
  return (
    <aside className="sidebar">
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
            drives.map((drive, i) => {
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
                    <span className="drive-tag">{drive.type}</span>
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
                </div>
              );
            })
          )}
        </div>

        {/* Navigation */}
        <div className="section-label" style={{ marginTop: 8 }}>Browse</div>
        <nav className="nav-menu">
          {[
            { key: 'all',     Icon: Folder, label: 'All Files' },
            { key: 'recent',  Icon: Clock,  label: 'Recent' },
            { key: 'starred', Icon: Star,   label: 'Favorites' },
          ].map(({ key, Icon, label }) => (
            <div
              key={key}
              className={`nav-item ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </div>
          ))}
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
