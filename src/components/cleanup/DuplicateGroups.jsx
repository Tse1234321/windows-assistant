import React, { useMemo } from 'react';
import Button from '../Button.jsx';
import { formatBytes, formatTime } from './cleanupShared.js';

export default function DuplicateGroups({
  groups = [],
  items = [],
  selected,
  onToggleItem,
  onKeepNewest,
  onOpenPath,
}) {
  const itemsByGroup = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!item.duplicateGroupId) continue;
      const list = map.get(item.duplicateGroupId) || [];
      list.push(item);
      map.set(item.duplicateGroupId, list);
    }
    return map;
  }, [items]);

  if (!groups.length) {
    return <p className="ee-empty">沒有找到內容相同的重複檔案，或尚未掃描。</p>;
  }

  return (
    <div>
      {groups.map((group) => {
        const groupItems = itemsByGroup.get(group.id) || [];
        const wasted = (group.size || 0) * Math.max(0, (group.count || 0) - 1);
        return (
          <div className="cc-dup-group" key={group.id}>
            <div className="cc-dup-head">
              <strong>
                {formatBytes(group.size)} × {group.count} 份
              </strong>
              <span>可節省 {formatBytes(wasted)}（保留 1 份）</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={groupItems.length < 2}
                onClick={() => onKeepNewest(groupItems)}
              >
                保留最新，勾選其餘
              </Button>
            </div>
            {groupItems.map((item) => (
              <div className="cc-dup-file" key={item.id}>
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => onToggleItem(item)}
                />
                <button
                  type="button"
                  className="cc-dup-path"
                  title={item.path}
                  onClick={() => onOpenPath(item.path)}
                >
                  {item.path}
                </button>
                <time>{formatTime(item.mtime)}</time>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
