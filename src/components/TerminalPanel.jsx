import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal, AlertTriangle, Play, Loader2, ShieldAlert, Lock, CheckCircle2,
  Copy, Check, X, ClipboardPaste, Trash2, RotateCcw, CornerDownLeft
} from 'lucide-react';
import { StorageService } from '../services/api';

const QUICK_COMMANDS = [
  'systemctl status cloudflared',
  'uptime',
  'df -h',
  'free -h',
  'uname -a',
  'journalctl -u cloudflared -n 25',
];

export function TerminalPanel() {
  const [command, setCommand]   = useState('');
  const [output, setOutput]     = useState(null);
  const [running, setRunning]   = useState(false);
  const [history, setHistory]   = useState([]);
  const [histIdx, setHistIdx]   = useState(-1);
  const [isLong, setIsLong]     = useState(false);
  const [copied, setCopied]     = useState(false);

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

  const run = async (confirmDangerous = false, customCmd = null) => {
    const cmd = customCmd || (confirmReq ? confirmReq.command : command.trim());
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
      setOutput({ stdout: result.stdout, stderr: result.stderr, cmd, time: new Date().toLocaleTimeString() });
      
      if (!confirmDangerous) {
        setHistory(prev => [cmd, ...prev.filter(c => c !== cmd)].slice(0, 20));
        setHistIdx(-1);
      }
    } catch (e) {
      if (e.message.includes('expired') || e.message.includes('re-authenticate')) {
        setSudoToken(null);
      }
      setConfirmReq(null);
      setOutput({ stdout: '', stderr: e.message, cmd, time: new Date().toLocaleTimeString() });
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCommand('');
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

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setCommand(text.trim());
        inputRef.current?.focus();
      }
    } catch (_) {
      // Fallback: prompt or focus
      inputRef.current?.focus();
    }
  };

  const handleClearInput = () => {
    setCommand('');
    setHistIdx(-1);
    inputRef.current?.focus();
  };

  const handleCopyOutput = () => {
    if (!output) return;
    const parts = [];
    if (output.cmd) parts.push(`$ ${output.cmd}`);
    if (output.stdout) parts.push(output.stdout);
    if (output.stderr) parts.push(`[STDERR]\n${output.stderr}`);
    const fullText = parts.join('\n');

    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  // --- RENDERING ---

  if (!sudoToken) {
    return (
      <div style={{
        padding: '36px 20px', textAlign: 'center', background: 'linear-gradient(145deg, rgba(20,20,22,1) 0%, rgba(9,9,11,1) 100%)',
        borderRadius: 16, border: '1px solid rgba(239,68,68,0.2)', boxShadow: '0 8px 32px rgba(239,68,68,0.1)'
      }}>
        <div style={{
          width: 70, height: 70, borderRadius: '50%', background: 'rgba(239,68,68,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto',
          boxShadow: '0 0 20px rgba(239,68,68,0.2)'
        }}>
          <ShieldAlert size={36} color="#ef4444" />
        </div>
        <h3 style={{ margin: '0 0 10px 0', color: '#f87171', fontSize: '1.3rem', letterSpacing: '0.04em' }}>Administrator Terminal</h3>
        <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', marginBottom: 26, maxWidth: 400, margin: '0 auto 26px auto', lineHeight: 1.6 }}>
          You are entering a high-privilege zone. Commands executed here have full system access.
          Authenticate with your Master Password to continue.
        </p>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 280 }}>
            <Lock size={16} color="#ef4444" style={{ position: 'absolute', left: 14, top: 13 }} />
            <input
              type="password"
              placeholder="Enter Master Password"
              value={sudoPassword}
              onChange={e => setSudoPassword(e.target.value)}
              style={{
                width: '100%', padding: '11px 14px 11px 40px', borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(0,0,0,0.4)',
                color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'all 0.2s',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
              }}
              onFocus={e => e.target.style.borderColor = '#ef4444'}
              onBlur={e => e.target.style.borderColor = 'rgba(239,68,68,0.3)'}
              autoFocus
            />
          </div>
          {sudoError && <div style={{ color: '#ef4444', fontSize: '0.82rem', fontWeight: 500 }}>{sudoError}</div>}
          <button type="submit" style={{
            width: 280, padding: '11px', background: '#ef4444', color: '#fff',
            borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '0.9rem',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
      
      {/* Dangerous Command Overlay */}
      {confirmReq && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', borderRadius: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center', border: '1px solid #ef4444'
        }}>
          <AlertTriangle size={44} color="#ef4444" style={{ marginBottom: 14 }} />
          <h3 style={{ margin: '0 0 10px 0', color: '#ef4444' }}>DANGEROUS COMMAND DETECTED</h3>
          <p style={{ color: 'var(--text-1)', fontSize: '0.88rem', marginBottom: 20, lineHeight: 1.5, maxWidth: 440 }}>
            {confirmReq.message}<br/><br/>
            <code style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '5px 10px', borderRadius: 4, color: '#ef4444', fontSize: '0.85rem' }}>
              {confirmReq.command}
            </code>
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" onClick={() => setConfirmReq(null)}>Cancel</button>
            <button className="btn btn-primary" style={{ background: '#ef4444', color: '#fff' }} onClick={() => run(true)}>
              {running ? <Loader2 size={16} className="spin" /> : 'Yes, I am sure'}
            </button>
          </div>
        </div>
      )}

      {/* Warning banner */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600 }}>
            Root Privileges Active — Full system command execution
          </span>
        </div>
        <button
          onClick={() => setSudoToken(null)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-3)', fontSize: '0.72rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'underline'
          }}
          title="Lock terminal and clear session"
        >
          <Lock size={11} /> Lock Session
        </button>
      </div>

      {/* Command input area */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              <Terminal size={12} color="var(--emerald)" />
              Command
            </label>
            {command && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
                (press <kbd style={{ padding: '1px 4px', background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>Esc</kbd> to clear)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isLong} onChange={e => setIsLong(e.target.checked)} />
              Long task (5m)
            </label>
          </div>
        </div>

        {/* Input bar with Clear and Paste controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <span style={{
              position: 'absolute', left: 10,
              fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700,
              color: 'var(--emerald)', pointerEvents: 'none', userSelect: 'none',
            }}>$</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={e => { setCommand(e.target.value); setHistIdx(-1); }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. systemctl status cloudflared"
              style={{
                width: '100%', padding: '9px 32px 9px 24px',
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: '#34d399', fontFamily: 'monospace',
                fontSize: '0.88rem', outline: 'none'
              }}
              disabled={running || !!confirmReq}
              autoFocus
            />
            {/* Clear typed command button inside input */}
            {command && (
              <button
                type="button"
                onClick={handleClearInput}
                style={{
                  position: 'absolute', right: 8,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.12)', border: 'none',
                  color: 'var(--text-2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0
                }}
                title="Clear typed command (Esc)"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Paste button */}
          <button
            type="button"
            onClick={handlePaste}
            className="btn btn-ghost"
            style={{
              padding: '0 10px', fontSize: '0.78rem', border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-2)'
            }}
            title="Paste command from clipboard"
          >
            <ClipboardPaste size={14} />
            <span style={{ fontSize: '0.75rem' }}>Paste</span>
          </button>

          {/* Run button */}
          <button 
            type="button"
            className="btn btn-primary" 
            onClick={() => run(false)}
            disabled={!command.trim() || running || !!confirmReq}
            style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: 5 }}
            title="Run command (Enter)"
          >
            {running ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Run</span>
          </button>
        </div>

        {/* Quick command presets */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', alignSelf: 'center', marginRight: 2 }}>Quick:</span>
          {QUICK_COMMANDS.map((qc) => (
            <button
              key={qc}
              type="button"
              onClick={() => { setCommand(qc); inputRef.current?.focus(); }}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 5, padding: '2px 7px', fontSize: '0.7rem', color: 'var(--text-2)',
                cursor: 'pointer', transition: 'background 0.15s', whiteSpace: 'nowrap'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              title={`Click to paste: ${qc}`}
            >
              {qc}
            </button>
          ))}
        </div>
      </div>

      {/* Output Console */}
      <div style={{
        background: '#090a0f',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        boxShadow: '0 0 20px rgba(16, 185, 129, 0.05), inset 0 0 12px rgba(0,0,0,0.6)',
        borderRadius: 10,
        minHeight: 280,
        maxHeight: 460,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Terminal Window Header with Controls */}
        <div style={{
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Traffic light dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', opacity: 0.8 }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', opacity: 0.8 }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', opacity: 0.8 }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginLeft: 8, fontFamily: 'monospace' }}>
              bash — hcdave@server
            </span>
          </div>

          {/* Action buttons: Copy Output & Clear Console */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Copy Output Button */}
            <button
              type="button"
              onClick={handleCopyOutput}
              disabled={!output}
              style={{
                background: copied ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                border: copied ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 5, padding: '3px 9px',
                color: copied ? 'var(--emerald)' : (output ? 'var(--text-1)' : 'var(--text-3)'),
                cursor: output ? 'pointer' : 'default',
                fontSize: '0.72rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'all 0.15s'
              }}
              title="Copy terminal command output to clipboard"
            >
              {copied ? <Check size={12} color="var(--emerald)" /> : <Copy size={12} />}
              <span>{copied ? 'Copied Output!' : 'Copy Output'}</span>
            </button>

            {/* Clear Output Button */}
            <button
              type="button"
              onClick={() => setOutput(null)}
              disabled={!output && !running}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 5, padding: '3px 8px',
                color: output ? 'var(--text-2)' : 'var(--text-3)',
                cursor: output ? 'pointer' : 'default',
                fontSize: '0.72rem',
                display: 'flex', alignItems: 'center', gap: 4,
                opacity: output ? 1 : 0.5
              }}
              title="Clear console output"
            >
              <Trash2 size={12} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Scrollable console body */}
        <div style={{
          padding: '16px',
          flex: 1,
          overflowY: 'auto',
          fontFamily: '"Fira Code", "JetBrains Mono", "Courier New", Courier, monospace',
          fontSize: '0.84rem',
          color: '#d4d4d8',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.55,
        }}>
          {running && (
            <div style={{ color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Loader2 size={15} className="spin" />
              <span>Executing: {command}…</span>
            </div>
          )}

          {!output && !running && (
            <div style={{ color: 'var(--text-3)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6, padding: '12px 0' }}>
              Terminal ready. Type or paste a command above and press Enter.
            </div>
          )}
          
          {output && (
            <div style={{ marginBottom: 10, color: 'var(--text-3)', userSelect: 'none', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
              <span><span style={{ color: 'var(--emerald)', fontWeight: 700 }}>$</span> {output.cmd}</span>
              {output.time && <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{output.time}</span>}
            </div>
          )}

          {hasStdout && <div style={{ color: '#e4e4e7' }}>{output.stdout}</div>}
          
          {hasStderr && (
            <div style={{ 
              color: '#f87171', 
              marginTop: hasStdout ? 14 : 0,
              paddingTop: hasStdout ? 14 : 0,
              borderTop: hasStdout ? '1px dashed rgba(239, 68, 68, 0.25)' : 'none'
            }}>
              {output.stderr}
            </div>
          )}
          
          {output && !hasStdout && !hasStderr && (
            <div style={{ color: 'var(--emerald)', fontStyle: 'italic', marginTop: 4 }}>
              ✔ Command completed successfully (exit 0, no output)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
