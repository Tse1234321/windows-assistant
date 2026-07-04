import React, { useState } from 'react';
import Button from '../Button.jsx';
import { formatTime } from './cleanupShared.js';

const TYPE_LABELS = {
  file: '檔案',
  folder: '資料夾',
  extension: '副檔名',
  keyword: '關鍵字',
};

const TYPE_PLACEHOLDERS = {
  file: 'C:\\path\\to\\file.tmp',
  folder: 'C:\\path\\to\\folder',
  extension: '.log',
  keyword: 'backup',
};

export default function IgnoreListManager({ items = [], busy, onAdd, onRemove }) {
  const [type, setType] = useState('folder');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  const submit = async () => {
    if (!value.trim()) return;
    const ok = await onAdd({ type, value: value.trim(), note: note.trim() });
    if (ok) {
      setValue('');
      setNote('');
    }
  };

  return (
    <section className="cc-panel">
      <div className="cc-panel-head">
        <h2 className="cc-panel-title">
          <span className="cc-panel-ico">⊘</span>
          忽略清單
        </h2>
      </div>
      <p className="cc-panel-desc">
        加入忽略的檔案、資料夾、副檔名或關鍵字不會出現在掃描結果；規則會在下次掃描時生效。
      </p>
      {items.length ? (
        <div>
          {items.map((item) => (
            <div className="cc-ignore-row" key={item.id}>
              <span className="cc-ignore-type">{TYPE_LABELS[item.type] || item.type}</span>
              <span className="cc-ignore-value" title={item.value}>
                {item.value}
              </span>
              {item.note ? <span className="cc-ignore-note">{item.note}</span> : null}
              <span className="cc-ignore-note">{formatTime(item.createdAt)}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(item.id)}>
                移除
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="ee-empty">目前沒有忽略規則。</p>
      )}
      <div className="cc-ignore-form">
        <label>
          類型
          <select className="ee-input" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 220 }}>
          內容
          <input
            className="ee-input"
            value={value}
            placeholder={TYPE_PLACEHOLDERS[type]}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label style={{ minWidth: 160 }}>
          備註（選填）
          <input
            className="ee-input"
            value={note}
            placeholder="為什麼忽略"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button variant="primary" disabled={busy || !value.trim()} onClick={submit}>
          新增規則
        </Button>
      </div>
    </section>
  );
}
