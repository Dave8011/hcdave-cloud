import React from 'react';
import { Search, UploadCloud, Settings, LogOut, Menu, Camera, QrCode, DownloadCloud } from 'lucide-react';

export function TopBar({
  search,
  setSearch,
  onUpload,
  onNewFolder,
  onSettings,
  onLogout,
  onMenuToggle,
  onScan,
  onOpenSearch,
  onQuickDrop,
  onCloudDownload
}) {
  return (
    <div className="top-bar">
      <button className="btn-icon mobile-menu-btn" onClick={onMenuToggle} style={{ display: 'none' }}>
        <Menu size={20} />
      </button>

      <div
        className="search-wrap"
        onClick={() => onOpenSearch && onOpenSearch(search)}
        style={{ cursor: 'pointer', position: 'relative' }}
        title="Search across all connected drives (Ctrl+K)"
      >
        <Search size={16} className="search-icon-pos" />
        <input
          type="search"
          className="search-input"
          placeholder="Search all drives (Ctrl+K)..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (onOpenSearch) onOpenSearch(e.target.value);
          }}
          onFocus={() => {
            if (onOpenSearch) onOpenSearch(search);
          }}
        />
        <span
          className="hide-mobile"
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '0.68rem',
            padding: '2px 6px',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-3)',
            fontWeight: 600,
            pointerEvents: 'none'
          }}
        >
          Ctrl+K
        </span>
      </div>

      <div className="top-actions">
        {onQuickDrop && (
          <button className="btn btn-ghost" onClick={onQuickDrop} title="QuickDrop — Phone to Cloud Transfer">
            <QrCode size={16} color="var(--emerald)" />
            <span className="hide-mobile">QuickDrop</span>
          </button>
        )}

        {onCloudDownload && (
          <button className="btn btn-ghost" onClick={onCloudDownload} title="Direct-to-Cloud Remote Downloader">
            <DownloadCloud size={16} color="var(--cyan)" />
            <span className="hide-mobile">Remote DL</span>
          </button>
        )}

        <button className="btn btn-ghost" onClick={onSettings}>
          <Settings size={16} />
          <span className="hide-mobile">Config</span>
        </button>

        <button className="btn btn-ghost" onClick={onNewFolder}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
          <span className="hide-mobile">New Folder</span>
        </button>

        <button className="btn btn-primary" onClick={onScan}>
          <Camera size={16} />
          <span className="hide-mobile">Scan</span>
        </button>

        <button className="btn btn-primary" onClick={onUpload}>
          <UploadCloud size={16} />
          <span className="hide-mobile">Upload</span>
        </button>

        <button
          className="btn-icon danger"
          onClick={onLogout}
          title="Lock & sign out"
          style={{ padding: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)', transition: 'var(--transition)' }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}
