import React from 'react';
import Button from '../Button.jsx';
import { IMPACT_TONE } from './cleanupShared.js';

export default function RecommendationsPanel({ recommendations = [], busy, onAction }) {
  if (!recommendations.length) return null;
  return (
    <section className="cc-panel">
      <div className="cc-panel-head">
        <h2 className="cc-panel-title">
          <span className="cc-panel-ico">✦</span>
          智慧建議
        </h2>
      </div>
      <p className="cc-panel-desc">根據掃描結果整理出的清理重點，點按鈕直接前往對應功能。</p>
      <div className="cc-reco-list">
        {recommendations.map((row) => (
          <div className="cc-reco-row" key={row.id}>
            <span className={`cc-impact ${IMPACT_TONE[row.impact] || 'ok'}`}>{row.impact}</span>
            <div className="cc-reco-body">
              <strong>{row.title}</strong>
              <span>{row.reason}</span>
            </div>
            {row.target !== 'all-good' ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(row.target)}>
                {row.button}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
