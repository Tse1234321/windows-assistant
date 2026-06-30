import React, { useMemo } from 'react';

function CircuitBackground() {
  const patternId = useMemo(() => `ee-cir-${Math.random().toString(36).slice(2, 9)}`, []);

  return (
    <svg className="ee-circuit" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id={patternId} width="240" height="240" patternUnits="userSpaceOnUse">
          <g
            fill="none"
            stroke="#2563eb"
            strokeOpacity="0.16"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M0 46 H64 V104 H140 V20" />
            <path d="M140 104 H202 V176" />
            <path d="M48 240 V182 H112" />
            <path d="M0 192 H30 V132 H92" />
            <path d="M182 240 V196 H232" />
            <path d="M202 24 H240" />
            <path d="M92 132 V92" />
          </g>
          <g fill="#13d6c0" fillOpacity="0.28">
            <circle cx="140" cy="104" r="3.4" />
            <circle cx="64" cy="46" r="2.6" />
            <circle cx="202" cy="176" r="3" />
            <circle cx="112" cy="182" r="2.6" />
            <circle cx="92" cy="132" r="2.6" />
            <circle cx="182" cy="196" r="2.6" />
            <circle cx="30" cy="192" r="2.4" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

function Particles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 22 }, () => {
        const size = 2 + Math.round(Math.random() * 3);
        return {
          left: Math.round(Math.random() * 100),
          top: Math.round(Math.random() * 100),
          size,
          dur: 8 + Math.round(Math.random() * 10),
          delay: -Math.round(Math.random() * 14),
        };
      }),
    [],
  );

  return (
    <div className="ee-particles">
      {dots.map((dot, index) => (
        <i
          key={index}
          style={{
            left: `${dot.left}%`,
            top: `${dot.top}%`,
            width: dot.size,
            height: dot.size,
            animationDuration: `${dot.dur}s`,
            animationDelay: `${dot.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function TechBackground() {
  return (
    <div className="ee-bg" aria-hidden="true">
      <CircuitBackground />
      <Particles />
    </div>
  );
}
