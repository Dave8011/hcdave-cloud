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
      <div style={{ padding: 24, textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
        <ShieldAlert size={48} color="#ef4444" style={{ marginBottom: 16 }} />
        <h3 style={{ margin: '0 0 8px 0', color: '#ef4444' }}>⚠️ Administrator Terminal</h3>
        <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px auto', lineHeight: 1.5 }}>
          Commands run here can modify or delete files, services, and system configuration. 
          Please re-enter your Master Password to unlock the terminal.
        </p>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 260 }}>
            <Lock size={16} color="var(--text-3)" style={{ position: 'absolute', left: 12, top: 12 }} />
            <input
              type="password"
              placeholder="Master Password"
              value={sudoPassword}
              onChange={e => setSudoPassword(e.target.value)}
              style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
              autoFocus
            />
          </div>
          {sudoError && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>{sudoError}</div>}
          <button type="submit" className="btn-primary" style={{ width: 260, justifyContent: 'center' }}>
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
        background: '#09090b',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        flex: 1,
        minHeight: 250,
        maxHeight: 400,
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        padding: '16px',
        color: '#e4e4e7',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all'
      }}>
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
