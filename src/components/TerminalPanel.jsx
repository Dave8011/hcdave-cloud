// ⚠️ TEMPORARY COMPONENT — DELETE THIS FILE AFTER TAILSCALE SETUP ⚠️
import React, { useState, useRef } from 'react';
import { Terminal, AlertTriangle, Play, Loader2 } from 'lucide-react';
import { StorageService } from '../services/api';

export function TerminalPanel() {
  const [command, setCommand]   = useState('');
  const [output, setOutput]     = useState(null);   // null = not yet run
  const [running, setRunning]   = useState(false);
  const [history, setHistory]   = useState([]);     // last 10 commands
  const [histIdx, setHistIdx]   = useState(-1);
  const inputRef = useRef(null);

  const run = async () => {
    const cmd = command.trim();
    if (!cmd || running) return;

    setRunning(true);
    setOutput(null);

    try {
      const result = await StorageService.execCommand(cmd);
      setOutput({ stdout: result.stdout, stderr: result.stderr, cmd });
      setHistory(prev => [cmd, ...prev.filter(c => c !== cmd)].slice(0, 10));
      setHistIdx(-1);
    } catch (e) {
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

  const hasStdout = output?.stdout?.trim();
  const hasStderr = output?.stderr?.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
            Temporary Admin Access
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.55 }}>
            This panel executes shell commands on your server as an admin user.
            <strong style={{ color: 'var(--text-1)' }}> Remove this feature after Tailscale is set up.</strong>
          </div>
        </div>
      </div>

      {/* Command input */}
      <div>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-3)',
          marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <Terminal size={12} />
          Command
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            {/* prompt decoration */}
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
              placeholder="e.g. hostname  or  curl -fsSL https://tailscale.com/install.sh | sh"
              disabled={running}
              style={{
                width: '100%',
                padding: '9px 12px 9px 24px',
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: 'var(--text-1)',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
                opacity: running ? 0.6 : 1,
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>
          <button
            onClick={run}
            disabled={running || !command.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px',
              background: running || !command.trim() ? 'rgba(99,102,241,0.25)' : 'var(--indigo)',
              border: 'none', borderRadius: 6, cursor: running || !command.trim() ? 'not-allowed' : 'pointer',
              color: 'white', fontWeight: 600, fontSize: '0.82rem',
              transition: 'background 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {running
              ? <><Loader2 size={14} className="spin" /><span>Running…</span></>
              : <><Play size={14} /><span>Execute</span></>}
          </button>
        </div>
        {history.length > 0 && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 5 }}>
            ↑↓ arrow keys to cycle history
          </div>
        )}
      </div>

      {/* Output panel */}
      {(running || output !== null) && (
        <div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-3)',
            marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Output
            {output?.cmd && (
              <span style={{
                fontFamily: 'monospace', fontWeight: 400, textTransform: 'none',
                color: 'var(--text-3)', letterSpacing: 0,
              }}>— {output.cmd}</span>
            )}
          </label>

          <div style={{
            background: '#0d0d14',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            padding: '12px 14px',
            minHeight: 140,
            maxHeight: 340,
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            lineHeight: 1.65,
          }}>
            {running && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
                <Loader2 size={13} className="spin" />
                <span>Executing — up to 90 s…</span>
              </div>
            )}

            {!running && output && (
              <>
                {/* prompt echo */}
                <div style={{ color: '#6ee7b7', marginBottom: 4 }}>
                  root@hcdave:~$ {output.cmd}
                </div>

                {hasStdout && (
                  <pre style={{
                    margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    color: '#e2e8f0',
                  }}>{output.stdout.trim()}</pre>
                )}

                {hasStderr && (
                  <pre style={{
                    margin: hasStdout ? '8px 0 0 0' : 0,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    color: '#fda4af',
                  }}>{output.stderr.trim()}</pre>
                )}

                {!hasStdout && !hasStderr && (
                  <span style={{ color: 'var(--text-3)' }}>(no output)</span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
