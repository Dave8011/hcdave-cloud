import React from 'react';
import { Search, UploadCloud, FolderPlus, Settings } from 'lucide-react';

export function TopBar({ searchQuery, setSearchQuery, onOpenUpload, onOpenSettings }) {
  return (
    <div className="top-bar">
      {/* Search Bar */}
      <div className="search-box">
        <Search size={18} className="search-icon" />
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search files in 2TB HDD & 512GB SSD..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Action Buttons */}
      <div className="top-actions">
        <button className="btn btn-secondary" onClick={onOpenSettings} title="Settings & Connection">
          <Settings size={18} />
          <span>Config</span>
        </button>

        <button className="btn btn-primary" onClick={onOpenUpload}>
          <UploadCloud size={18} />
          <span>Upload File</span>
        </button>
      </div>
    </div>
  );
}
