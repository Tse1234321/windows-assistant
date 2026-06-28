import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { clampPercent, describeArc, describePercentArc } from '../../utils/svgArc.js';

function toneForPercent(value) {
  if (value >= 90) return 'danger';
  if (value >= 75) return 'warning';
  return 'good';
}

function useAnimatedPercent(value) {
  const target = clampPercent(value);
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const start = displayRef.current;
    const delta = target - start;
    if (Math.abs(delta) < 0.5) {
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    let frame = 0;
    let raf = 0;
    const total = 28;
    const tick = () => {
      frame += 1;
      const progress = 1 - Math.pow(1 - frame / total, 3);
      const next = start + delta * progress;
      displayRef.current = next;
      setDisplay(next);
      if (frame < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return display;
}

export default function RingGauge({
  value,
  label,
  detail,
  tone,
  size = 148,
  stroke = 11,
  empty = false,
}) {
  const gradientId = useId().replace(/:/g, '');
  const percent = clampPercent(value);
  const display = useAnimatedPercent(percent);
  const resolvedTone = tone || toneForPercent(percent);
  const arc = useMemo(() => describePercentArc(80, 80, 58, display), [display]);
  const track = useMemo(() => describeArc(80, 80, 58, -150, 150), []);

  if (empty) {
    return (
      <div className="ring-gauge ring-gauge-empty" style={{ width: size, height: size }}>
        <span>--</span>
        <em>{label}</em>
      </div>
    );
  }

  return (
    <div className={`ring-gauge tone-${resolvedTone}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="16" x2="144" y1="28" y2="132">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="58%" stopColor="var(--accent-2)" />
            <stop offset="100%" stopColor="var(--accent-magenta)" />
          </linearGradient>
        </defs>
        <path className="ring-track" d={track} strokeWidth={stroke} />
        <path className="ring-value" d={arc} stroke={`url(#${gradientId})`} strokeWidth={stroke} />
      </svg>
      <span>{Math.round(display)}%</span>
      <em>{label}</em>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}
