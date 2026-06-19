import React from 'react';

const ICONS = { ok: 'OK', warn: 'WA', danger: 'ER', info: 'IN' };

export default function AlertList({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return <p className="muted">目前沒有需要處理的提醒。</p>;
  }

  return (
    <ul className="alert-list">
      {alerts.map((alert, index) => (
        <li key={`${alert.title}-${index}`} className={`alert-item ${alert.level || 'info'}`}>
          <span className="icon">{ICONS[alert.level] || ICONS.info}</span>
          <div className="body">
            <div className="title">{alert.title}</div>
            {alert.desc ? <div className="desc">{alert.desc}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
