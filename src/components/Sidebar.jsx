import React from 'react';
import { HardDrive, Cpu, Folder, Star, Clock, Trash2, ShieldCheck, Wifi, PlusCircle } from 'lucide-react';

export function Sidebar({ drives, activeDriveId, setActiveDriveId, activeTab, setActiveTab }) {
  return (
    <aside className="sidebar">
      <div>
        {/* Brand Header */}
        <div className="brand">
          <div className="brand-icon">
            <Wifi size={24} />
          </div>
          <div>
            <div className="brand-title">HC Dave Cloud</div>
            <div className="brand-subtitle">hcdavecloud.in</div>
          </div>
        </div>

        {/* Dynamic Plug & Play Drives Section */}
        <div className="drives-section">
          <div className="section-label">
            <span>Connected Drives ({drives.length})</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)' }}>Plug & Play</span>
          </div>

          {drives.length > 0 ? (
            drives.map((drive) => {
              const usedPercent = Math.round((drive.usedGB / drive.totalGB) * 100);
              const isActive = activeDriveId === drive.id;

              return (
                <div 
                  key={drive.id}
                  className={`drive-card ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveDriveId(drive.id)}
                >
                  <div className="drive-header">
                    <div className="drive-info">
                      {drive.type === 'SSD' ? (
                        <Cpu size={18} className="drive-icon" style={{ color: 'var(--accent-cyan)' }} />
                      ) : (
                        <HardDrive size={18} className="drive-icon" />
                      )}
                      <span className="drive-name">{drive.name}</span>
                    </div>
                    <span className="drive-badge">{drive.totalGB} GB</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div 
                      className="progress-bar-fill" 
                      style={{ 
                        width: `${usedPercent}%`,
                        background: drive.type === 'SSD' 
                          ? 'linear-gradient(90deg, var(--accent-cyan), var(--accent-emerald))'
                          : 'linear-gradient(90deg, var(--accent-primary), var(--accent-cyan))'
                      }}
                    ></div>
                  </div>
                  <div className="drive-meta">
                    <span>{drive.usedGB} GB used</span>
                    <span>{drive.freeGB} GB free</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ padding: '16px', textOverflow: 'ellipsis', background: 'var(--bg-card)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              No USB drives detected. Plug in your HDD or SSD to start!
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <div className="section-label">Navigation</div>
        <nav className="nav-menu">
          <div 
            className={`nav-item ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <Folder size={18} />
            <span>All Files</span>
          </div>
          <div 
            className={`nav-item ${activeTab === 'recent' ? 'active' : ''}`}
            onClick={() => setActiveTab('recent')}
          >
            <Clock size={18} />
            <span>Recent</span>
          </div>
          <div 
            className={`nav-item ${activeTab === 'starred' ? 'active' : ''}`}
            onClick={() => setActiveTab('starred')}
          >
            <Star size={18} />
            <span>Favorites</span>
          </div>
        </nav>
      </div>

      {/* Connection Status Pill */}
      <div className="status-pill">
        <div className="status-indicator">
          <span className="dot"></span>
          <span style={{ fontWeight: 600 }}>Cloudflare Active</span>
        </div>
        <ShieldCheck size={16} color="var(--accent-emerald)" />
      </div>
    </aside>
  );
}
