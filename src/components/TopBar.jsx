import React from 'react';
import { Search, UploadCloud, Settings, LogOut } from 'lucide-react';

export function TopBar({ searchQuery, setSearchQuery, onOpenUpload, onOpenSettings, onLogout }) {
  return (
    <div className="top-bar">
      {/* Search Bar */}
      <div className="search-box">
        <Search size={18} className="search-icon" />
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search files in connected drives..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Action Buttons */}
      <div className="top-actions">
        <button className="btn btn-secondary" onClick={onOpenSettings} title="Settings & Tunnel">
          <Settings size={18} />
          <span>Config</span>
        </button>

        <button className="btn btn-primary" onClick={onOpenUpload}>
          <UploadCloud size={18} />
          <span>Upload</span>
        </button>

        <button className="btn btn-secondary" onClick={onLogout} title="Lock & Logout">
          <LogOut size={18} color="var(--accent-rose)" />
        </button>
      </div>
    </div>
  );
}
