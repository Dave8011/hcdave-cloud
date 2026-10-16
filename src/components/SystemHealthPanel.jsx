import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Cpu, Thermometer, Wifi, WifiOff, ShieldCheck, ShieldOff,
  HardDrive, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Server,
  Globe, Clock, Bell, BellOff
} from 'lucide-react';
import { StorageService } from '../services/api';

function StatusBadge({ status }) {
  const cfg = {
    online:  { color: 'var(--emerald)', bg: 'rgba(16,185,129,0.12)', label: 'Online' },
    warning: { color: 'var(--amber)',   bg: 'rgba(245,158,11,0.12)',  label: 'Warning' },
    offline: { color: 'var(--rose)',    bg: 'rgba(244,63,94,0.12)',   label: 'Offline' },
  }[status] || { color: 'var(--text-3)', bg: 'rgba(255,255,255,0.05)', label: 'Unknown' };
  return (
    <span style={{
      fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: cfg.bg, color: cfg.color, letterSpacing: '0.04em', textTransform: 'uppercase'
    }}>{cfg.label}</span>
  );
}

function MetricCard({ icon: Icon, label, value, sub, status, color = 'var(--indigo)' }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 600 }}>
          <Icon size={13} color={color} />
          {label}
        </div>
        {status && <StatusBadge status={status} />}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{sub}</div>}
    </div>
  );
}

function ProgBar({ pct, color = 'var(--indigo)' }) {
  const c = pct >= 90 ? 'var(--rose)' : pct >= 75 ? 'var(--amber)' : color;
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 999, height: 6, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: c, borderRadius: 999, transition: 'width 0.6s ease' }} />
    </div>
  );
}

function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? 'rgba(244,63,94,0.95)' : 'rgba(245,158,11,0.95)',
          color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: '0.82rem',
          fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxWidth: 280,
          display: 'flex', alignItems: 'center', gap: 8, animation: 'fadeUp 0.3s ease'
        }}>
          <AlertTriangle size={14} />
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function SystemHealthPanel() {
  const [health, setHealth]     = useState(null);
  const [drives, setDrives]     = useState([]);
  const [internet, setInternet] = useState(null); // true/false/null
  const [tunnel, setTunnel]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [toasts, setToasts]     = useState([]);
  const [notifs, setNotifs]     = useState(true);
  const prevAlerts              = useRef({});

  const addToast = useCallback((msg, type = 'warn') => {
    if (!notifs) return;
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000);
  }, [notifs]);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await StorageService.getHealth();
      setHealth(data);

      // Check internet by pinging the agent URL
      const agentOnline = data.status === 'ok';
      setInternet(agentOnline);

      // Tunnel status: if we can reach the agent via its public URL it's up
      setTunnel(agentOnline ? 'online' : 'offline');

      // Alert on changes
      const cpu = parseFloat(data.stats?.load);
      const ram = data.stats?.memUsage;
      const temp = data.stats?.tempC;

      if (notifs) {
        if (cpu > 2.0 && !prevAlerts.current.cpu) { addToast(`⚡ High CPU load: ${cpu}`, 'warn'); prevAlerts.current.cpu = true; }
        if (cpu <= 1.5) prevAlerts.current.cpu = false;
        if (ram > 90 && !prevAlerts.current.ram) { addToast(`🧠 RAM critical: ${ram}%`, 'error'); prevAlerts.current.ram = true; }
        if (ram <= 80) prevAlerts.current.ram = false;
        if (temp && temp > 75 && !prevAlerts.current.temp) { addToast(`🌡️ High temperature: ${temp}°C`, 'error'); prevAlerts.current.temp = true; }
        if (temp && temp <= 65) prevAlerts.current.temp = false;
      }
    } catch {
      setInternet(false);
      setTunnel('offline');
      if (notifs && !prevAlerts.current.agent) { addToast('Agent offline — cannot connect', 'error'); prevAlerts.current.agent = true; }
    }
  }, [addToast, notifs]);

  const fetchDrives = useCallback(async () => {
    try {
      const list = await StorageService.getDrives();
      setDrives(list || []);

      // Notify on drives with very low space
      if (notifs) {
        for (const d of (list || [])) {
          const key = `low_${d.id}`;
          if (d.percent >= 95 && !prevAlerts.current[key]) {
            addToast(`💾 ${d.name}: disk almost full (${d.freeGB} GB left)`, 'error');
            prevAlerts.current[key] = true;
          }
          if (d.percent < 90) prevAlerts.current[`low_${d.id}`] = false;
        }
      }
    } catch {}
  }, [addToast, notifs]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchHealth(), fetchDrives()]);
    setLastRefresh(new Date());
    setLoading(false);
  }, [fetchHealth, fetchDrives]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const cpuLoad  = parseFloat(health?.stats?.load ?? 0);
  const ramPct   = health?.stats?.memUsage ?? 0;
  const uptime   = health?.stats?.uptimeHours;
  const tempC    = health?.stats?.tempC ?? null;

  const cpuStatus  = cpuLoad > 3 ? 'offline' : cpuLoad > 1.5 ? 'warning' : 'online';
  const ramStatus  = ramPct > 90 ? 'offline' : ramPct > 75 ? 'warning' : 'online';
  const tempStatus = tempC ? (tempC > 75 ? 'offline' : tempC > 60 ? 'warning' : 'online') : null;
  const netStatus  = internet === null ? null : internet ? 'online' : 'offline';
  const cfStatus   = tunnel === 'online' ? 'online' : tunnel === 'offline' ? 'offline' : null;
  const apiStatus  = health?.status === 'ok' ? 'online' : 'offline';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Toast toasts={toasts} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={12} />
          {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Loading…'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setNotifs(n => !n)}
            title={notifs ? 'Disable notifications' : 'Enable notifications'}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 10px', color: notifs ? 'var(--amber)' : 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}
          >
            {notifs ? <Bell size={13} /> : <BellOff size={13} />}
            {notifs ? 'Alerts On' : 'Alerts Off'}
          </button>
          <button
            onClick={refresh}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 10px', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}
          >
            <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Refresh
          </button>
        </div>
      </div>

      {/* System Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        <MetricCard icon={Cpu} label="CPU Load" value={health ? cpuLoad.toFixed(2) : '—'}
          sub="1-min avg load" status={health ? cpuStatus : null} color="var(--cyan)" />
        <MetricCard icon={Activity} label="RAM Usage" value={health ? `${ramPct}%` : '—'}
          sub={`${Math.round((1 - ramPct / 100) * 100)}% free`} status={health ? ramStatus : null} color="var(--violet)" />
        {tempC !== null && (
          <MetricCard icon={Thermometer} label="Temperature" value={`${tempC}°C`}
            sub="CPU thermal" status={tempStatus} color="var(--rose)" />
        )}
        <MetricCard icon={Clock} label="Uptime" value={uptime ? `${uptime}h` : '—'}
          sub="since last boot" color="var(--emerald)" />
        <MetricCard icon={Globe} label="Internet" value={internet === null ? '…' : internet ? 'Connected' : 'Down'}
          status={netStatus} color="var(--cyan)" />
        <MetricCard icon={internet ? ShieldCheck : ShieldOff} label="CF Tunnel" value={tunnel ?? '…'}
          status={cfStatus} color="var(--indigo)" />
        <MetricCard icon={Server} label="API Server" value={health ? (health.status === 'ok' ? 'Running' : 'Error') : '…'}
          sub={health ? `v${health.version}` : ''} status={health ? apiStatus : null} color="var(--emerald)" />
      </div>

      {/* Drive storage */}
      {drives.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <HardDrive size={14} color="var(--amber)" /> Storage Drives
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {drives.map(d => {
              const driveStatus = d.percent >= 95 ? 'offline' : d.percent >= 80 ? 'warning' : 'online';
              return (
                <div key={d.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <HardDrive size={12} color="var(--text-3)" />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)' }}>{d.name}</span>
                      {d.role && (
                        <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(99,102,241,0.15)', color: 'var(--indigo)', fontWeight: 700 }}>{d.role}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{d.usedGB}/{d.totalGB} GB</span>
                      <StatusBadge status={driveStatus} />
                    </div>
                  </div>
                  <ProgBar pct={d.percent} color="linear-gradient(90deg, var(--indigo), var(--violet))" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 3 }}>
                    <span>{d.percent}% used</span>
                    <span>{d.freeGB} GB free · {d.type}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent info */}
      {health && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: '0.75rem' }}>
          {[
            ['Version', `v${health.version}`],
            ['Local IP', health.localIp],
            ['Last Update', health.lastUpdated?.split(' - ')[0] || '—'],
            ['Drives', `${drives.length} connected`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-3)' }}>{k}</span>
              <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
