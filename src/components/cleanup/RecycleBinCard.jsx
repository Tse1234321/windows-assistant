import React, { useState } from 'react';
import Button from '../Button.jsx';
import ConfirmDangerDialog from '../ConfirmDangerDialog.jsx';
import InlineAlert from '../InlineAlert.jsx';
import { formatBytes } from './cleanupShared.js';

export default function RecycleBinCard({ recycleBin, busy, onEmpty, onRefresh }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const count = recycleBin?.count || 0;
  const size = recycleBin?.size || 0;

  return (
    <section className="cc-panel">
      <div className="cc-panel-head">
        <h2 className="cc-panel-title">
          <span className="cc-panel-ico">♻</span>
          資源回收筒
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onRefresh}>
            重新整理
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy || count === 0}
            onClick={() => setConfirmOpen(true)}
          >
            清空資源回收筒
          </Button>
        </div>
      </div>
      <div className="cc-recycle-stats">
        <div>
          <span>項目數</span>
          <strong>{count}</strong>
        </div>
        <div>
          <span>佔用容量</span>
          <strong>{formatBytes(size)}</strong>
        </div>
      </div>
      <InlineAlert tone="danger" title="永久刪除">
        清空資源回收筒後，檔案通常無法再從原位置還原。請先確認裡面沒有需要救回的檔案。
      </InlineAlert>
      <ConfirmDangerDialog
        open={confirmOpen}
        title="確認清空資源回收筒"
        message={`即將永久刪除 ${count} 個項目（約 ${formatBytes(size)}），此動作無法還原。確定要清空嗎？`}
        confirmLabel="永久清空"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onEmpty();
        }}
      />
    </section>
  );
}
