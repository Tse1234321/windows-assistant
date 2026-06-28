import React from 'react';

function clamp(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, (n / Math.max(1, max)) * 100);
}

export default function BarMini({
  items = [],
  max,
  valueKey = 'value',
  labelKey = 'label',
  unit = '',
  emptyTitle = 'No data',
}) {
  const values = items
    .map((item) => Number(item?.[valueKey]))
    .filter((value) => Number.isFinite(value) && value > 0);
  const maxValue =
    Number.isFinite(Number(max)) && Number(max) > 0 ? Number(max) : Math.max(1, ...values);

  if (!items.length || values.length === 0) {
    return (
      <div className="bar-mini-empty">
        <strong>{emptyTitle}</strong>
      </div>
    );
  }

  return (
    <div className="bar-mini" style={{ '--bar-count': items.length }}>
      {items.map((item, index) => {
        const value = Number(item?.[valueKey]) || 0;
        const height = clamp(value, maxValue);
        const label = item?.[labelKey] || `#${index + 1}`;
        return (
          <div className="bar-mini-item" key={`${label}-${index}`}>
            <div className="bar-mini-track" title={`${label}: ${value}${unit}`}>
              <i style={{ height: `${height}%`, '--delay': `${index * 42}ms` }} />
            </div>
            <span>{label}</span>
            <em>
              {Math.round(value)}
              {unit}
            </em>
          </div>
        );
      })}
    </div>
  );
}
