import React, { useEffect, useState } from 'react';

/*
 * Cinematic D-mark intro (V3: The 3D Outline Draw)
 * Phases:
 *   0  → black silence
 *   1  → Glowing outline of the D draws itself (stroke animation) while slightly zooming out
 *   2  → The D fills with the gradient & background glow ignites
 *   3  → Light streak sweeps across
 *   4  → Wordmark fades up
 *   5  → Fade out to app
 */
export function IntroAnimation({ onDone, fast = false }) {
  const [phase, setPhase] = useState(0);

  // Timings (+1 second added, sketching phase is much longer)
  const T = fast
    ? { p1: 50, p2: 250, p3: 450, p4: 650, p5: 900, done: 1100 }
    : { p1: 200, p2: 2200, p3: 3000, p4: 3600, p5: 4700, done: 5400 };

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), T.p1);
    const t2 = setTimeout(() => setPhase(2), T.p2);
    const t3 = setTimeout(() => setPhase(3), T.p3);
    const t4 = setTimeout(() => setPhase(4), T.p4);
    const t5 = setTimeout(() => setPhase(5), T.p5);
    const t6 = setTimeout(() => onDone(),    T.done);
    return () => [t1, t2, t3, t4, t5, t6].forEach(clearTimeout);
  }, []);

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

  const showOutline  = phase >= 1;
  const showFill     = phase >= 2;
  const showStreak   = phase >= 3;
  const showWordmark = phase >= 4;
  const fadeOut      = phase >= 5;

  return (
    <div
      aria-hidden="true"
      style={{
        position:  'fixed',
        inset:     0,
        zIndex:    9999,
        background:'#030508', // pure cinematic dark
        display:   'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        overflow: 'hidden',
        opacity:    fadeOut ? 0 : 1,
        transition: fadeOut ? 'opacity 0.7s cubic-bezier(0.4,0,1,1)' : 'none',
        pointerEvents: 'none',
      }}
    >
      {/* ── Background radial glow ── */}
      <div style={{
        position:   'absolute',
        width:      600,
        height:     600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 65%)',
        opacity:    showFill ? 1 : 0,
        transform:  showFill ? 'scale(1)' : 'scale(0.8)',
        transition: 'opacity 2.5s ease-out, transform 3.5s ease-out',
      }} />

      {/* ── Outer wrapper for the 3D slow zoom out effect ── */}
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transform: showOutline ? 'scale(1) translate3d(0,0,0)' : 'scale(1.15) translate3d(0,15px,0)',
        transition: 'transform 6s cubic-bezier(0.2, 0.8, 0.2, 1)', // softer, longer ease out
      }}>
        
        {/* ── D Letterform ── */}
        <div style={{
          position: 'relative',
          width:    128,
          height:   140,
          filter: showFill
            ? 'drop-shadow(0 0 24px rgba(99,102,241,0.6)) drop-shadow(0 0 50px rgba(34,211,238,0.3))'
            : 'drop-shadow(0 0 10px rgba(34,211,238,0.4))',
          transition: 'filter 2.5s ease',
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
              <linearGradient id="dg_stroke" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#818cf8" />
              </linearGradient>

              {/* Streak clip */}
              <clipPath id="streakClip">
                <rect
                  x={showStreak ? '200' : '-160'}
                  y="-10"
                  width="70"
                  height="160"
                  style={{
                    transform: 'skewX(-20deg)',
                    transition: showStreak
                      ? `x ${fast ? '0.35s' : '0.9s'} cubic-bezier(0.25,1,0.5,1)`
                      : 'none',
                  }}
                />
              </clipPath>
            </defs>

            {/* 1. The solid fill that fades in (placed BEHIND the outline now) */}
            <path
              d={D_PATH}
              fillRule="evenodd"
              fill="url(#dg)"
              style={{
                opacity: showFill ? 1 : 0,
                transition: 'opacity 2.5s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />

            {/* 2. The glowing outline that draws itself (Sketching phase) */}
            <path
              d={D_PATH}
              fillRule="evenodd"
              fill="transparent"
              stroke="url(#dg_stroke)"
              strokeWidth="1.5"
              strokeDasharray="1500"
              strokeDashoffset={showOutline ? 0 : 1500}
              style={{
                // Outline stays visible even when fill comes in, blending seamlessly
                transition: showOutline
                  ? `stroke-dashoffset ${fast ? '0.2s' : '2.4s'} cubic-bezier(0.4, 0, 0.2, 1)`
                  : 'none',
              }}
            />

            {/* 3. The sweeping light streak */}
            <path
              d={D_PATH}
              fillRule="evenodd"
              fill="#ffffff"
              clipPath="url(#streakClip)"
              style={{
                opacity: showStreak ? 0.8 : 0,
                transition: 'opacity 0.2s',
              }}
            />
          </svg>
        </div>

        {/* ── Wordmark ── */}
        <div style={{
          marginTop:   36,
          display:     'flex',
          flexDirection: 'column',
          alignItems:  'center',
          gap:         6,
          opacity:     showWordmark ? 1 : 0,
          transform:   showWordmark ? 'translateY(0)' : 'translateY(10px)',
          transition:  showWordmark
            ? 'opacity 0.8s ease, transform 0.8s cubic-bezier(0.16,1,0.3,1)'
            : 'none',
        }}>
          <span style={{
            fontFamily:   "'Inter', system-ui, sans-serif",
            fontWeight:   800,
            fontSize:     fast ? '1.1rem' : '1.45rem',
            letterSpacing:'0.28em',
            textTransform:'uppercase',
            background:   'linear-gradient(90deg, #c7d2fe, #22d3ee)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor:  'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 2px 10px rgba(34,211,238,0.2))',
          }}>
            Dave Cloud
          </span>
          {!fast && (
            <span style={{
              fontFamily:   "'Inter', system-ui, sans-serif",
              fontSize:     '0.7rem',
              letterSpacing:'0.25em',
              textTransform:'uppercase',
              color:        'rgba(255,255,255,0.2)',
            }}>
              hcdavecloud.in
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
