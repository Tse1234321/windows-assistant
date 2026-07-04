import React, { useMemo } from 'react';
import Button from '../Button.jsx';
import DataTable from '../DataTable.jsx';
import StatusBadge from '../StatusBadge.jsx';
import {
  categoryLabel,
  formatBytes,
  formatTime,
  normalizeRisk,
  riskTone,
} from './cleanupShared.js';

export default function FileDetailTable({
  items = [],
  selected,
  onToggleItem,
  categoryFilter,
  onCategoryFilter,
  fileSecurity = {},
  onScanFile,
  onCheckReputation,
  onOpenPath,
  onIgnoreFile,
  onIgnoreFolder,
}) {
  const categories = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const item of items) {
      if (seen.has(item.category)) continue;
      seen.add(item.category);
      list.push(item.category);
    }
    return list;
  }, [items]);

  const filtered = useMemo(
    () => (categoryFilter ? items.filter((item) => item.category === categoryFilter) : items),
    [items, categoryFilter],
  );

  return (
    <div>
      {categories.length > 1 ? (
        <div className="cc-chip-row">
          <button
            type="button"
            className={`cc-chip ${!categoryFilter ? 'on' : ''}`}
            onClick={() => onCategoryFilter('')}
          >
            全部 {items.length}
          </button>
          {categories.map((name) => (
            <button
              type="button"
              className={`cc-chip ${categoryFilter === name ? 'on' : ''}`}
              key={name}
              onClick={() => onCategoryFilter(name)}
            >
              {categoryLabel(name)} {items.filter((item) => item.category === name).length}
            </button>
          ))}
        </div>
      ) : null}
      <DataTable
        rows={filtered.slice(0, 500)}
        emptyTitle="尚未找到檔案"
        emptyDescription="重新掃描後會顯示檔名、分類、容量、最後修改時間、風險、來源路徑與清理影響。"
        columns={[
          {
            key: 'select',
            label: '',
            width: 42,
            render: (row) => (
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => onToggleItem(row)}
              />
            ),
          },
          { key: 'fileName', label: '檔名', render: (row) => <strong>{row.fileName}</strong> },
          { key: 'category', label: '分類', render: (row) => categoryLabel(row.category) },
          { key: 'size', label: '大小', render: (row) => formatBytes(row.size) },
          { key: 'mtime', label: '最後修改時間', render: (row) => formatTime(row.mtime) },
          {
            key: 'risk',
            label: '風險等級',
            render: (row) => (
              <StatusBadge tone={riskTone(row.risk)}>{normalizeRisk(row.risk)}</StatusBadge>
            ),
          },
          {
            key: 'path',
            label: '來源路徑',
            className: 'path',
            render: (row) => (
              <button className="link-button" onClick={() => onOpenPath(row.path)}>
                {row.path}
              </button>
            ),
          },
          {
            key: 'security',
            label: '安全',
            render: (row) => (
              <div className="cleanup-security-actions">
                <Button size="sm" variant="ghost" onClick={() => onScanFile(row)}>
                  立即掃毒
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onCheckReputation(row)}>
                  VT
                </Button>
                {fileSecurity[row.id]?.scan ? <span>{fileSecurity[row.id].scan}</span> : null}
                {fileSecurity[row.id]?.reputation ? (
                  <span>{fileSecurity[row.id].reputation}</span>
                ) : null}
              </div>
            ),
          },
          {
            key: 'ignore',
            label: '忽略',
            render: (row) => (
              <div className="cleanup-security-actions">
                <Button size="sm" variant="ghost" onClick={() => onIgnoreFile(row)}>
                  忽略此檔案
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onIgnoreFolder(row)}>
                  忽略資料夾
                </Button>
              </div>
            ),
          },
          {
            key: 'impact',
            label: '清理影響說明',
            render: (row) => row.cleanImpact || row.impact || '移到資源回收筒，可在清空前還原。',
          },
        ]}
      />
    </div>
  );
}
