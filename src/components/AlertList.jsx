import React from 'react';

const ICONS = { ok: '✅', warn: '⚠️', danger: '🔴', info: 'ℹ️' };

/**
 * alerts: [{ level: 'ok'|'warn'|'danger'|'info', title, desc }]
 */
export default function AlertList({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return <p className="muted">目前沒有提醒，一切正常 🎉</p>;
  }
  return (
    <ul className="alert-list">
      {alerts.map((a, i) => (
        <li key={i} className={`alert-item ${a.level || 'info'}`}>
          <span className="icon">{ICONS[a.level] || ICONS.info}</span>
          <div className="body">
            <div className="title">{a.title}</div>
            {a.desc ? <div className="desc">{a.desc}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
