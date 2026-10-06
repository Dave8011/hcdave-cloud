import React, { useState, useRef, useEffect } from 'react';
import { Terminal, AlertTriangle, Play, Loader2, ShieldAlert, Lock, CheckCircle2 } from 'lucide-react';
import { StorageService } from '../services/api';

export function TerminalPanel() {
  const [command, setCommand]   = useState('');
  const [output, setOutput]     = useState(null);
  const [running, setRunning]   = useState(false);
  const [history, setHistory]   = useState([]);
  const [histIdx, setHistIdx]   = useState(-1);
  const [isLong, setIsLong]     = useState(false);

  // Security State
  const [sudoToken, setSudoToken] = useState(null);
  const [sudoPassword, setSudoPassword] = useState('');
  const [sudoError, setSudoError] = useState('');
  
  // Confirmation State
  const [confirmReq, setConfirmReq] = useState(null); // { message, command }

  const inputRef = useRef(null);

  const handleAuth = async (e) => {
    e.preventDefault();
    setSudoError('');
    try {
      const token = await StorageService.authenticateTerminal(sudoPassword);
      setSudoToken(token);
      setSudoPassword('');
    } catch (e) {
      setSudoError(e.message);
    }
  };

  const run = async (confirmDangerous = false) => {
    const cmd = confirmReq ? confirmReq.command : command.trim();
    if (!cmd || running) return;

    setRunning(true);
    setSudoError('');
    if (!confirmReq) setOutput(null);

    try {
      const result = await StorageService.execCommand(cmd, sudoToken, confirmDangerous, isLong);
      
      if (result.requireConfirmation) {
        setConfirmReq({ message: result.message, command: cmd });
        setRunning(false);
        return;
      }

      setConfirmReq(null);
      setOutput({ stdout: result.stdout, stderr: result.stderr, cmd });
      
      if (!confirmDangerous) {
        setHistory(prev => [cmd, ...prev.filter(c => c !== cmd)].slice(0, 20));
        setHistIdx(-1);
      }
    } catch (e) {
      if (e.message.includes('expired') || e.message.includes('re-authenticate')) {
        setSudoToken(null);
      }
      setConfirmReq(null);
      setOutput({ stdout: '', stderr: e.message, cmd });
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      run();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      if (history[next] !== undefined) setCommand(history[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(histIdx - 1, -1);
      setHistIdx(next);
      setCommand(next === -1 ? '' : history[next]);
    }
  };

  // --- RENDERING ---

  if (!sudoToken) {
    return (
      <div style={{
        padding: '40px 24px', textAlign: 'center', background: 'linear-gradient(145deg, rgba(20,20,22,1) 0%, rgba(9,9,11,1) 100%)',
        borderRadius: 16, border: '1px solid rgba(239,68,68,0.2)', boxShadow: '0 8px 32px rgba(239,68,68,0.1)'
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto',
          boxShadow: '0 0 20px rgba(239,68,68,0.2)'
        }}>
          <ShieldAlert size={40} color="#ef4444" />
        </div>
        <h3 style={{ margin: '0 0 12px 0', color: '#f87171', fontSize: '1.4rem', letterSpacing: '0.05em' }}>Administrator Terminal</h3>
        <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginBottom: 32, maxWidth: 420, margin: '0 auto 32px auto', lineHeight: 1.6 }}>
          You are entering a high-privilege zone. Commands executed here have full system access.
          Authenticate to continue.
        </p>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 280 }}>
            <Lock size={18} color="#ef4444" style={{ position: 'absolute', left: 14, top: 13 }} />
            <input
              type="password"
              placeholder="Enter Master Password"
              value={sudoPassword}
              onChange={e => setSudoPassword(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px 12px 42px', borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(0,0,0,0.4)',
                color: '#fff', fontSize: '1rem', outline: 'none', transition: 'all 0.2s',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
              }}
              onFocus={e => e.target.style.borderColor = '#ef4444'}
              onBlur={e => e.target.style.borderColor = 'rgba(239,68,68,0.3)'}
              autoFocus
            />
          </div>
          {sudoError && <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 500 }}>{sudoError}</div>}
          <button type="submit" style={{
            width: 280, padding: '12px', background: '#ef4444', color: '#fff',
            borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '0.95rem',
            cursor: 'pointer', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.05em'
          }}
          onMouseOver={e => e.target.style.background = '#dc2626'}
          onMouseOut={e => e.target.style.background = '#ef4444'}
          >
            Unlock Terminal
          </button>
        </form>
      </div>
    );
  }

  const hasStdout = output?.stdout?.trim();
  const hasStderr = output?.stderr?.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
      
      {/* Dangerous Command Overlay */}
      {confirmReq && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', borderRadius: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center', border: '1px solid #ef4444'
        }}>
          <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: 16 }} />
          <h3 style={{ margin: '0 0 12px 0', color: '#ef4444' }}>DANGEROUS COMMAND DETECTED</h3>
          <p style={{ color: 'var(--text-1)', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.5 }}>
            {confirmReq.message}<br/><br/>
            <code style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '4px 8px', borderRadius: 4, color: '#ef4444' }}>
              {confirmReq.command}
            </code>
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-ghost" onClick={() => setConfirmReq(null)}>Cancel</button>
            <button className="btn-primary" style={{ background: '#ef4444', color: '#fff' }} onClick={() => run(true)}>
              {running ? <Loader2 size={16} className="spin" /> : 'Yes, I am sure'}
            </button>
          </div>
        </div>
      )}

      {/* Warning banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 14px',
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        borderRadius: 8,
      }}>
        <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#f59e0b', marginBottom: 3 }}>
            HC Cloud Admin Terminal
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.55 }}>
            You are operating with full system privileges. All commands are audited.
          </div>
        </div>
      </div>

      {/* Command input */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <Terminal size={12} />
            Command
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={isLong} onChange={e => setIsLong(e.target.checked)} />
            Long running task (5 mins)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              fontFamily: 'monospace', fontSize: '0.85rem',
              color: 'var(--emerald)', pointerEvents: 'none', userSelect: 'none',
            }}>$</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={e => { setCommand(e.target.value); setHistIdx(-1); }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. systemctl status hcdave-agent"
              style={{
                width: '100%', padding: '10px 12px 10px 24px',
                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8, color: 'var(--emerald)', fontFamily: 'monospace',
                fontSize: '0.9rem', outline: 'none'
              }}
              disabled={running || !!confirmReq}
            />
          </div>
          <button 
            className="btn-primary" 
            onClick={() => run(false)}
            disabled={!command.trim() || running || !!confirmReq}
            style={{ padding: '0 16px' }}
          >
            {running ? <Loader2 size={18} className="spin" /> : <Play size={18} />}
          </button>
        </div>
      </div>

      {/* Output Console */}
      <div style={{
        background: '#050505',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        boxShadow: '0 0 20px rgba(16, 185, 129, 0.05), inset 0 0 10px rgba(0,0,0,0.5)',
        borderRadius: 8,
        flex: 1,
        minHeight: 320,
        maxHeight: 500,
        overflowY: 'auto',
        fontFamily: '"Fira Code", "JetBrains Mono", "Courier New", Courier, monospace',
        fontSize: '0.88rem',
        padding: '24px 20px',
        color: '#a1a1aa',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        position: 'relative'
      }}>
        {/* Fake window controls */}
        <div style={{ position: 'absolute', top: 12, left: 16, display: 'flex', gap: 6, opacity: 0.7 }}>
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444', border: '1px solid #dc2626' }} />
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#f59e0b', border: '1px solid #d97706' }} />
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#10b981', border: '1px solid #059669' }} />
        </div>
        <div style={{ height: 12 }} /> {/* spacer for fake window controls */}
        {!output && !running && (
          <div style={{ color: 'var(--text-3)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
            Terminal ready. Type a command to execute.
          </div>
        )}
        
        {output && (
          <div style={{ marginBottom: 12, color: 'var(--text-3)', userSelect: 'none' }}>
            <span style={{ color: 'var(--emerald)' }}>$</span> {output.cmd}
          </div>
        )}

        {hasStdout && <div>{output.stdout}</div>}
        
        {hasStderr && (
          <div style={{ 
            color: '#ef4444', 
            marginTop: hasStdout ? 16 : 0,
            paddingTop: hasStdout ? 16 : 0,
            borderTop: hasStdout ? '1px dashed rgba(239, 68, 68, 0.2)' : 'none'
          }}>
            {output.stderr}
          </div>
        )}
        
        {output && !hasStdout && !hasStderr && (
          <div style={{ color: 'var(--text-3)', fontStyle: 'italic', marginTop: 8 }}>
            (Command completed with no output)
          </div>
        )}
      </div>
    </div>
  );
}
