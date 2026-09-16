import React, { useState } from 'react';
import { X, Globe, Check, ShieldCheck } from 'lucide-react';
import { StorageService } from '../services/api';

export function SettingsModal({ onClose, onSave }) {
  const [agentUrl, setAgentUrl] = useState(StorageService.getAgentUrl());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    StorageService.setAgentUrl(agentUrl);
    setSaved(true);
    setTimeout(() => {
      onSave();
      onClose();
    }, 800);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <div className="modal-title">Connection Settings</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="field">
          <label className="field-label">
            <Globe size={12} />
            <span>Home Storage Agent URL</span>
          </label>
          <input
            type="url"
            className="field-input"
            value={agentUrl}
            onChange={(e) => { setAgentUrl(e.target.value); setSaved(false); }}
            placeholder="https://api.hcdavecloud.in"
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 8 }}>
            This should be your Cloudflare Tunnel URL (e.g. <code style={{ color: 'var(--cyan)' }}>https://api.hcdavecloud.in</code>) or your Tailscale IP.
          </div>
        </div>

        <div style={{ padding: '14px', background: 'rgba(99,102,241,0.07)', borderRadius: 'var(--r-sm)', border: '1px solid rgba(99,102,241,0.18)', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>
            <ShieldCheck size={15} color="var(--emerald)" />
            <span>Plug & Play Auto-Detection</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
            Any USB HDD, SSD, or Flash Drive plugged into your TV Box / router is automatically detected and served without any extra configuration.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? <Check size={16} /> : <Check size={16} />}
            <span>{saved ? 'Saved!' : 'Save & Reconnect'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
