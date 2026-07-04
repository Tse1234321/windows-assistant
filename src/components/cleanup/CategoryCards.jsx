import React from 'react';
import Button from '../Button.jsx';
import StatusBadge from '../StatusBadge.jsx';
import Toggle from '../Toggle.jsx';
import {
  CATEGORY_ICONS,
  CLEANABLE_CATEGORIES,
  categoryLabel,
  formatBytes,
  normalizeRisk,
  riskTone,
} from './cleanupShared.js';

export default function CategoryCards({
  rows = [],
  totalSize = 0,
  includedCategories,
  onToggleCategory,
  onShowInfo,
}) {
  if (!rows.length) {
    return <p className="ee-empty">尚未掃描，先執行智慧掃描取得各分類結果。</p>;
  }
  return (
    <div className="cc-cat-grid">
      {rows.map((row) => {
        const name = row.name || row.category;
        const cleanable = CLEANABLE_CATEGORIES.includes(name);
        const included = !cleanable || includedCategories.has(name);
        const share = totalSize > 0 ? Math.min(100, ((row.size || 0) / totalSize) * 100) : 0;
        return (
          <div className={`cc-cat-card ${cleanable && !included ? 'off' : ''}`} key={name}>
            <div className="cc-cat-head">
              <span className="cc-cat-ico" aria-hidden="true">
                {CATEGORY_ICONS[name] || '▣'}
              </span>
              <strong>{categoryLabel(name)}</strong>
              <StatusBadge tone={riskTone(row.risk)}>{normalizeRisk(row.risk)}</StatusBadge>
            </div>
            <div className="cc-cat-meta">
              <strong>{formatBytes(row.size)}</strong>
              <span>
                {row.status === 'Disabled' ? '已停用' : `${row.count || 0} 個項目`}
              </span>
            </div>
            <div className="cc-size-bar">
              <i style={{ '--share': `${share}%` }} />
            </div>
            <div className="cc-cat-foot">
              {cleanable ? (
                <span className="cc-cat-toggle">
                  <Toggle checked={included} onChange={() => onToggleCategory(name)} />
                  納入清理
                </span>
              ) : (
                <span className="cc-cat-toggle">於「系統項目」頁籤管理</span>
              )}
              <Button size="sm" variant="ghost" onClick={() => onShowInfo(name)}>
                說明
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
