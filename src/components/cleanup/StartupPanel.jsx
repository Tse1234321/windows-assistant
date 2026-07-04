import React from 'react';
import Button from '../Button.jsx';
import InlineAlert from '../InlineAlert.jsx';
import Toggle from '../Toggle.jsx';
import { formatTime } from './cleanupShared.js';

export default function StartupPanel({ startup, busy, onToggleDisabledMark, onOpenPath }) {
  const items = startup?.items || [];
  return (
    <section className="cc-panel">
      <div className="cc-panel-head">
        <h2 className="cc-panel-title">
          <span className="cc-panel-ico">⏻</span>
          啟動項（啟動資料夾）
        </h2>
        {startup?.startupDir ? (
          <Button size="sm" variant="ghost" onClick={() => onOpenPath(startup.startupDir)}>
            開啟啟動資料夾
          </Button>
        ) : null}
      </div>
      <InlineAlert tone="warn" title="這是標記清單">
        「標記停用」只會把項目記在追蹤清單，方便你整理；實際停用請到「工作管理員 &gt; 啟動」操作，
        或直接從啟動資料夾移除捷徑。
      </InlineAlert>
      {items.length ? (
        <div style={{ marginTop: 10 }}>
          {items.map((item) => (
            <div className="cc-startup-row" key={item.path}>
              <span className="cc-startup-name">{item.name}</span>
              <time>{formatTime(item.mtime)}</time>
              <span className="cc-startup-mark">
                <Toggle
                  checked={!!item.disabledListed}
                  disabled={busy}
                  onChange={() => onToggleDisabledMark(item)}
                />
                標記停用
              </span>
              <Button size="sm" variant="ghost" onClick={() => onOpenPath(item.path)}>
                開啟位置
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="ee-empty">啟動資料夾目前沒有項目。</p>
      )}
    </section>
  );
}
