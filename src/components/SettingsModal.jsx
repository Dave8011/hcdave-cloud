import React, { useState, useEffect } from 'react';
import { X, Globe, Check, ShieldCheck, RefreshCw, Activity, Cpu, Clock, Database } from 'lucide-react';
import { StorageService } from '../services/api';
import { CachePanel } from './CachePanel';

export function SettingsModal({ onClose, onSave, drives }) {
  const [tab, setTab]               = useState('connection'); // 'connection' | 'cache'
  const [agentUrl, setAgentUrl]     = useState(StorageService.getAgentUrl());
  const [saved, setSaved]           = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMsg, setUpdateMsg]   = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [agentVersion, setAgentVersion] = useState('Checking...');
  const [localIp, setLocalIp]       = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [stats, setStats]           = useState(null);
  const [cacheWarn, setCacheWarn]   = useState(false);

  useEffect(() => {
    StorageService.getHealth().then(data => {
      setAgentVersion(data.version || 'unknown');
      setLocalIp(data.localIp || 'Unknown');
      setLastUpdated(data.lastUpdated || 'Unknown');
      if (data.stats) setStats(data.stats);
    });
    // Check cache warning badge
    StorageService.getCacheStatus().then(cs => {
      setCacheWarn(cs.warn || false);
    }).catch(() => {});
  }, []);

  const handleSave = () => {
    StorageService.setAgentUrl(agentUrl);
    setSaved(true);
    setTimeout(() => { onSave(); onClose(); }, 800);
  };

  const triggerUpdate = async () => {
    setShowConfirm(false);
    try {
      setIsUpdating(true);
      setUpdateMsg('Pulling latest code from GitHub…');
      const res = await StorageService.updateAgent();
      setUpdateMsg(res.message || 'Update started. Waiting for server restart…');

      const poll = setInterval(async () => {
        try {
          const data = await StorageService.getHealth();
          if (data && data.version && data.version !== agentVersion) {
            clearInterval(poll);
            setAgentVersion(data.version);
            setLastUpdated(data.lastUpdated || 'Unknown');
            setUpdateMsg('✅ Update complete! Running new version.');
            setIsUpdating(false);
          }
        } catch (_) {}
      }, 3000);
    } catch (e) {
      setUpdateMsg('❌ ' + (e.message || 'Update failed'));
      setIsUpdating(false);
    }
  };

  const TABS = [
    { key: 'connection', label: 'Connection', Icon: Globe },
    { key: 'cache',      label: 'Video Cache', Icon: Database, badge: cacheWarn },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>

      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)} style={{ zIndex: 1000, background: 'rgba(0,0,0,0.8)' }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 320, animation: 'scaleIn 0.2s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ background: 'rgba(99,102,241,0.1)', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <RefreshCw size={32} color="var(--indigo)" />
              </div>
              <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-1)' }}>Update Server</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                This will download the latest software to your Home Server and restart the backend.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={triggerUpdate}>Update Now</button>
            </div>
          </div>
        </div>
      )}

      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-title-row">
          <div className="modal-title">Settings</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 4 }}>
          {TABS.map(({ key, label, Icon, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                background: tab === key ? 'var(--bg-card)' : 'transparent',
                color: tab === key ? 'var(--text-1)' : 'var(--text-3)',
                position: 'relative', transition: 'all 0.15s',
              }}
            >
              <Icon size={13} />
              {label}
              {badge && (
                <span style={{ position: 'absolute', top: 5, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--rose)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Connection Tab */}
        {tab === 'connection' && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="agent-url-input">
                <Globe size={12} /><span>Home Storage Agent URL</span>
              </label>
              <input
                id="agent-url-input" name="agentUrl" type="url" className="field-input"
                value={agentUrl}
                onChange={(e) => { setAgentUrl(e.target.value); setSaved(false); }}
                placeholder="https://api.hcdavecloud.in"
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 8 }}>
                Your Cloudflare Tunnel URL (e.g. <code style={{ color: 'var(--cyan)' }}>https://api.hcdavecloud.in</code>)
              </div>
            </div>

            <div style={{ padding: '14px', background: 'rgba(99,102,241,0.07)', borderRadius: 'var(--r-sm)', border: '1px solid rgba(99,102,241,0.18)', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>
                <ShieldCheck size={15} color="var(--emerald)" /><span>Plug &amp; Play Auto-Detection</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
                Any USB HDD, SSD, or Flash Drive plugged into your server is automatically detected and served without any extra configuration.
              </div>
            </div>

            <div style={{ padding: '14px', background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem' }}>
                  <RefreshCw size={15} color="var(--text-1)" /><span>Server Updates</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', gap: 12 }}>
                  {localIp && <span>SSH IP: <strong style={{ color: 'var(--cyan)' }}>{localIp}</strong></span>}
                  <span>Version: <strong style={{ color: 'var(--cyan)' }}>v{agentVersion}</strong></span>
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 12 }}>
                Last Git Update: <strong style={{ color: 'var(--text-2)' }}>{lastUpdated}</strong>
              </div>
              {stats && (
                <div style={{ display: 'flex', gap: 15, fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 12, padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Activity size={12} /> CPU: <strong style={{ color: 'var(--cyan)' }}>{stats.load}</strong></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Cpu size={12} /> RAM: <strong style={{ color: 'var(--cyan)' }}>{stats.memUsage}%</strong></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={12} /> Up: <strong style={{ color: 'var(--cyan)' }}>{stats.uptimeHours}h</strong></div>
                </div>
              )}
              <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 }}>
                Pull the latest code from GitHub to your Home Server and restart the background agent without needing a monitor.
              </div>
              <button
                className="btn"
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={() => setShowConfirm(true)}
                disabled={isUpdating}
              >
                {isUpdating ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
                <span>{isUpdating ? 'Updating...' : 'Update Agent Software'}</span>
              </button>
              {updateMsg && (
                <div style={{ fontSize: '0.75rem', marginTop: 10, color: updateMsg.includes('❌') ? 'var(--rose)' : 'var(--emerald)', whiteSpace: 'pre-wrap' }}>
                  {updateMsg}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                <Check size={16} /><span>{saved ? 'Saved!' : 'Save & Reconnect'}</span>
              </button>
            </div>
          </>
        )}

        {/* Cache Tab */}
        {tab === 'cache' && <CachePanel drives={drives} />}
      </div>
    </div>
  );
}
