import React, { useState, useEffect } from 'react';
import { X, Globe, Check, ShieldCheck, RefreshCw, Activity, Cpu, Clock } from 'lucide-react';
import { StorageService } from '../services/api';

export function SettingsModal({ onClose, onSave }) {
  const [agentUrl, setAgentUrl] = useState(StorageService.getAgentUrl());
  const [saved, setSaved] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const [agentVersion, setAgentVersion] = useState('Checking...');
  const [localIp, setLocalIp] = useState('');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    StorageService.getHealth().then(data => {
      setAgentVersion(data.version || 'unknown');
      setLocalIp(data.localIp || 'Unknown');
      if (data.stats) setStats(data.stats);
    });
  }, []);

  const handleSave = () => {
    StorageService.setAgentUrl(agentUrl);
    setSaved(true);
    setTimeout(() => {
      onSave();
      onClose();
    }, 800);
  };

  const handleUpdate = async () => {
    if (!window.confirm('This will update the backend on your Home Server to the latest GitHub code and restart it. Continue?')) return;
    try {
      setIsUpdating(true);
      setUpdateMsg('Sending update command...');
      const res = await StorageService.updateAgent();
      setUpdateMsg(res.message || 'Update started successfully!');
    } catch (e) {
      setUpdateMsg(e.message || 'Update failed');
    } finally {
      setIsUpdating(false);
    }
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

        <div style={{ padding: '14px', background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem' }}>
              <RefreshCw size={15} color="var(--text-1)" />
              <span>Server Updates</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', gap: 12 }}>
              {localIp && (
                <span>SSH IP: <strong style={{ color: 'var(--cyan)' }}>{localIp}</strong></span>
              )}
              <span>Version: <strong style={{ color: 'var(--cyan)' }}>v{agentVersion}</strong></span>
            </div>
          </div>
          
          {stats && (
            <div style={{ display: 'flex', gap: 15, fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 12, padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Activity size={12} /> CPU Load: <strong style={{color: 'var(--cyan)'}}>{stats.load}</strong></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Cpu size={12} /> RAM: <strong style={{color: 'var(--cyan)'}}>{stats.memUsage}%</strong></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={12} /> Uptime: <strong style={{color: 'var(--cyan)'}}>{stats.uptimeHours}h</strong></div>
            </div>
          )}

          <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 }}>
            Automatically pull the latest code from GitHub to your Home Server and restart the background agent without needing a monitor.
          </div>
          <button 
            className="btn" 
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={handleUpdate}
            disabled={isUpdating}
          >
            {isUpdating ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
            <span>{isUpdating ? 'Updating...' : 'Update Agent Software'}</span>
          </button>
          {updateMsg && (
            <div style={{ fontSize: '0.75rem', marginTop: 10, color: updateMsg.includes('failed') ? 'var(--red)' : 'var(--emerald)' }}>
              {updateMsg}
            </div>
          )}
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
