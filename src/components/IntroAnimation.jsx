import React, { useEffect, useRef, useState } from 'react';

/*
 * Cinematic D-mark intro — inspired by Netflix's "N" reveal.
 * Pure SVG letterform — zero box containers.
 * Phases:
 *   0  → black silence
 *   1  → D letterform "burns in" with a radial glow from centre
 *   2  → horizontal light streak sweeps left → right across the D
 *   3  → glow pulses once, DAVE CLOUD wordmark rises below
 *   4  → everything fades to transparent → onDone()
 */
export function IntroAnimation({ onDone, fast = false }) {
  const [phase, setPhase] = useState(0);
  const canvasRef = useRef(null);

  // fast = quick 1-second flash used between transitions (login→app, logout→login)
  const T = fast
    ? { p1: 80, p2: 400, p3: 700, p4: 950,  done: 1150 }
    : { p1: 200, p2: 900, p3: 1600, p4: 2700, done: 3300 };

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), T.p1);
    const t2 = setTimeout(() => setPhase(2), T.p2);
    const t3 = setTimeout(() => setPhase(3), T.p3);
    const t4 = setTimeout(() => setPhase(4), T.p4);
    const t5 = setTimeout(() => onDone(),    T.done);
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, []);

  /* The D letterform as a single evenodd SVG path — no box, just the letter */
  // Outer: full D silhouette  Inner: hollow cutout  → evenodd makes it hollow
  const D_PATH = `
    M 0,0
    L 0,140
    L 48,140
    Q 128,140 128,70
    Q 128,0   48,0
    Z
    M 26,24
    L 48,24
    Q 100,24 100,70
    Q 100,116 48,116
    L 26,116
    Z
  `;

  const showLetter   = phase >= 1;
  const showStreak   = phase >= 2;
  const showWordmark = phase >= 3;
  const fadeOut      = phase >= 4;

  return (
    <div
      aria-hidden="true"
      style={{
        position:  'fixed',
        inset:     0,
        zIndex:    9999,
        background:'#050709',
        display:   'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        overflow: 'hidden',
        opacity:    fadeOut ? 0 : 1,
        transition: fadeOut ? 'opacity 0.55s cubic-bezier(0.4,0,1,1)' : 'none',
        pointerEvents: 'none',
      }}
    >
      {/* ── Background radial glow that builds with the letter ── */}
      <div style={{
        position:   'absolute',
        width:      500,
        height:     500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
        opacity:    showLetter ? 1 : 0,
        transform:  showLetter ? 'scale(1)' : 'scale(0.3)',
        transition: 'opacity 1.2s ease, transform 1.4s cubic-bezier(0.16,1,0.3,1)',
        pointerEvents: 'none',
      }} />

      {/* ── D Letterform — pure SVG, evenodd hollow ── */}
      <div style={{
        position: 'relative',
        width:    128,
        height:   140,
        opacity:  showLetter ? 1 : 0,
        transform: showLetter
          ? 'scaleY(1) translateY(0)'
          : 'scaleY(0.6) translateY(20px)',
        transformOrigin: 'center',
        transition: showLetter
          ? 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.8s cubic-bezier(0.16,1,0.3,1)'
          : 'none',
        filter: showLetter
          ? 'drop-shadow(0 0 32px rgba(99,102,241,0.7)) drop-shadow(0 0 60px rgba(34,211,238,0.3))'
          : 'none',
      }}>
        <svg
          viewBox="0 0 128 140"
          width="128"
          height="140"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id="dg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#818cf8" />
              <stop offset="45%"  stopColor="#6366f1" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>

            {/* Streak clip — a thin vertical band that sweeps left to right */}
            <clipPath id="streakClip">
              <rect
                x={showStreak ? '200' : '-160'}
                y="-10"
                width="80"
                height="160"
                style={{
                  transition: showStreak
                    ? `x ${fast ? '0.35s' : '0.6s'} cubic-bezier(0.4,0,0.2,1)`
                    : 'none',
                }}
              />
            </clipPath>
          </defs>

          {/* The D — filled with gradient */}
          <path
            d={D_PATH}
            fillRule="evenodd"
            fill="url(#dg)"
          />

          {/* Light streak overlay — white, clipped to sweeping band */}
          <path
            d={D_PATH}
            fillRule="evenodd"
            fill="rgba(255,255,255,0.55)"
            clipPath="url(#streakClip)"
          />
        </svg>
      </div>

      {/* ── Wordmark ── */}
      <div style={{
        marginTop:   32,
        display:     'flex',
        flexDirection: 'column',
        alignItems:  'center',
        gap:         6,
        opacity:     showWordmark ? 1 : 0,
        transform:   showWordmark ? 'translateY(0)' : 'translateY(14px)',
        transition:  showWordmark
          ? 'opacity 0.55s ease, transform 0.55s cubic-bezier(0.16,1,0.3,1)'
          : 'none',
      }}>
        <span style={{
          fontFamily:   "'Inter', system-ui, sans-serif",
          fontWeight:   800,
          fontSize:     fast ? '1.1rem' : '1.45rem',
          letterSpacing:'0.24em',
          textTransform:'uppercase',
          background:   'linear-gradient(90deg, #818cf8, #22d3ee)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor:  'transparent',
          backgroundClip: 'text',
        }}>
          Dave Cloud
        </span>
        {!fast && (
          <span style={{
            fontFamily:   "'Inter', system-ui, sans-serif",
            fontSize:     '0.68rem',
            letterSpacing:'0.22em',
            textTransform:'uppercase',
            color:        'rgba(255,255,255,0.25)',
          }}>
            hcdavecloud.in
          </span>
        )}
      </div>
    </div>
  );
}
