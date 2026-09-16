import React from 'react';
import { Search, UploadCloud, Settings, LogOut } from 'lucide-react';

export function TopBar({ search, setSearch, onUpload, onSettings, onLogout }) {
  return (
    <div className="top-bar">
      <div className="search-wrap">
        <Search size={16} className="search-icon-pos" />
        <input
          type="search"
          className="search-input"
          placeholder="Search files and folders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="top-actions">
        <button className="btn btn-ghost" onClick={onSettings}>
          <Settings size={16} />
          <span>Config</span>
        </button>

        <button className="btn btn-primary" onClick={onUpload}>
          <UploadCloud size={16} />
          <span>Upload</span>
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
