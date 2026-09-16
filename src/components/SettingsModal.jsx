import React, { useState } from 'react';
import { X, Check, Globe, Server } from 'lucide-react';
import { StorageService } from '../services/api';

export function SettingsModal({ onClose, onSave }) {
  const [agentUrl, setAgentUrl] = useState(StorageService.getAgentUrl());

  const handleSave = () => {
    StorageService.setAgentUrl(agentUrl);
    onSave();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Cloud Domain & Tunnel Settings</div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div>
          {/* Domain Config */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Globe size={16} color="var(--accent-cyan)" />
              <span>Storage Agent Domain / Tunnel URL</span>
            </label>
            <input 
              type="text" 
              className="form-input" 
              value={agentUrl} 
              onChange={(e) => setAgentUrl(e.target.value)}
              placeholder="https://api.hcdavecloud.in"
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
              Connected to <strong>hcdavecloud.in</strong> via Cloudflare Tunnel / Tailscale Funnel.
            </div>
          </div>

          <div style={{ padding: '14px', background: 'rgba(99,102,241,0.08)', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.2)', marginBottom: '20px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginBottom: 4 }}>
              Plug & Play Drive Auto-Detection
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Any USB HDD, SSD, or Flash Drive plugged into your router/TV Box will automatically be detected and served.
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>
              <Check size={18} />
              <span>Save Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
