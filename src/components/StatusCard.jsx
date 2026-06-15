import React from 'react';

/**
 * A single dashboard metric card.
 * Optionally renders a progress bar when `barPercent` + `barLevel` are provided.
 */
export default function StatusCard({ label, icon, value, sub, barPercent, barLevel }) {
  return (
    <div className="card status-card">
      <div className="label">
        {icon ? <span>{icon}</span> : null}
        {label}
      </div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
      {typeof barPercent === 'number' ? (
        <div className="bar">
          <span
            className={barLevel || 'ok'}
            style={{ width: `${Math.max(0, Math.min(100, barPercent))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
