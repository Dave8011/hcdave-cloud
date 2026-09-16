import React, { useEffect, useState } from 'react';

/**
 * Cinematic intro — like Netflix's "N" but ours:
 * A bold "D" lettermark builds up from a vertical slab,
 * a light streak sweeps across it, then the full wordmark
 * fades in below before the whole screen dissolves.
 */
export function IntroAnimation({ onDone }) {
  const [phase, setPhase] = useState(0);
  // phase 0 → black
  // phase 1 → D builds in (slab slides right)
  // phase 2 → streak sweeps
  // phase 3 → wordmark appears
  // phase 4 → screen fades out → onDone

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300);   // start build
    const t2 = setTimeout(() => setPhase(2), 1100);  // streak
    const t3 = setTimeout(() => setPhase(3), 1700);  // wordmark
    const t4 = setTimeout(() => setPhase(4), 2800);  // fade out
    const t5 = setTimeout(() => onDone(), 3400);     // done
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#07090f',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 0,
        opacity: phase === 4 ? 0 : 1,
        transition: phase === 4 ? 'opacity 0.6s cubic-bezier(0.4,0,1,1)' : 'none',
        pointerEvents: phase === 4 ? 'none' : 'all',
      }}
    >
      {/* The D mark */}
      <div style={{ position: 'relative', width: 110, height: 120 }}>

        {/* Left vertical slab — always visible */}
        <div style={{
          position: 'absolute',
          left: 0, top: 0,
          width: 20, height: 120,
          background: 'linear-gradient(180deg, #6366f1, #22d3ee)',
          borderRadius: 4,
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? 'scaleY(1)' : 'scaleY(0)',
          transformOrigin: 'top',
          transition: 'opacity 0.05s, transform 0.55s cubic-bezier(0.22,1,0.36,1)',
        }} />

        {/* Right curved arc — the belly of the D */}
        <svg
          viewBox="0 0 90 120"
          width={90} height={120}
          style={{
            position: 'absolute', left: 20, top: 0,
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? 'translateX(0)' : 'translateX(-18px)',
            transition: 'opacity 0.1s, transform 0.6s cubic-bezier(0.22,1,0.36,1) 0.12s',
          }}
        >
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          {/* D curve: open path */}
          <path
            d="M0 0 Q90 0 90 60 Q90 120 0 120"
            fill="url(#g1)"
          />
        </svg>

        {/* Inner cutout — white "negative" space to make hollow D */}
        <div style={{
          position: 'absolute',
          left: 26, top: 16,
          width: 58, height: 88,
          background: '#07090f',
          borderRadius: '0 46px 46px 0',
          opacity: phase >= 1 ? 1 : 0,
          transition: 'opacity 0.05s 0.2s',
        }} />

        {/* Light streak sweep */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.55) 50%, transparent 80%)',
          backgroundSize: '200% 100%',
          backgroundPosition: phase >= 2 ? '200% 0' : '-100% 0',
          transition: phase >= 2 ? 'background-position 0.55s cubic-bezier(0.4,0,0.2,1)' : 'none',
          borderRadius: 4,
          pointerEvents: 'none',
          zIndex: 10,
        }} />
      </div>

      {/* Wordmark */}
      <div style={{
        marginTop: 28,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: 800,
        fontSize: '1.35rem',
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        background: 'linear-gradient(90deg, #6366f1, #22d3ee)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        opacity: phase >= 3 ? 1 : 0,
        transform: phase >= 3 ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}>
        Dave Cloud
      </div>

      {/* Tagline */}
      <div style={{
        marginTop: 8,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: '0.72rem',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.3)',
        opacity: phase >= 3 ? 1 : 0,
        transition: 'opacity 0.5s ease 0.2s',
      }}>
        hcdavecloud.in
      </div>
    </div>
  );
}
