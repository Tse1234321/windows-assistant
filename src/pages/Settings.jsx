import React, { useEffect, useState } from 'react';
import ActionButton from '../components/ActionButton.jsx';

export default function Settings() {
  const [text, setText] = useState('');
  const [configPath, setConfigPath] = useState('');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!window.api) {
      setToast({ type: 'error', msg: '無法連接 Electron 主程序。' });
      setLoading(false);
      return;
    }
    const res = await window.api.getSettings();
    setConfigPath(res.path || '');
    setText(JSON.stringify(res.settings, null, 2));
    if (!res.ok) setToast({ type: 'error', msg: res.error });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setToast({ type: 'error', msg: `JSON 格式錯誤：${err.message}` });
      return;
    }
    const res = await window.api.saveSettings(parsed);
    if (res.ok) {
      setToast({ type: 'ok', msg: `已儲存到 ${res.path}` });
    } else {
      setToast({ type: 'error', msg: res.error || '儲存失敗' });
    }
  };

  const openFile = async () => {
    await window.api.openSettingsFile();
  };

  return (
    <div>
      <h1 className="page-title">設定</h1>
      <p className="page-subtitle">
        直接編輯 JSON 設定檔（modes / projects / general）。儲存後立即生效。
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row-between" style={{ marginBottom: 6 }}>
          <span className="muted">設定檔位置</span>
          <ActionButton variant="ghost" icon="📂" onClick={openFile}>
            用系統開啟
          </ActionButton>
        </div>
        <div className="path">{configPath || '—'}</div>
      </div>

      {loading ? (
        <p>
          <span className="spinner" /> 載入中…
        </p>
      ) : (
        <>
          <textarea
            className="config-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          <div className="button-row" style={{ marginTop: 14 }}>
            <ActionButton variant="primary" icon="💾" onClick={save}>
              儲存設定
            </ActionButton>
            <ActionButton variant="ghost" icon="↩️" onClick={load}>
              還原（重新載入）
            </ActionButton>
          </div>
          {toast ? <div className={`toast ${toast.type}`}>{toast.msg}</div> : null}
        </>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-title">欄位說明</div>
        <ul className="muted" style={{ lineHeight: 1.8, marginTop: 4 }}>
          <li>
            <code>general.downloadsPath</code>：自訂 Downloads 路徑（留空則用使用者家目錄）。
          </li>
          <li>
            <code>general.monitorDrives</code>：要監控的磁碟陣列，例如{' '}
            <code>["C:\\", "D:\\"]</code>；空陣列 <code>[]</code> 會自動偵測所有可用磁碟。（仍相容舊的{' '}
            <code>monitorDrive</code> 單一字串設定。）
          </li>
          <li>
            <code>modes[]</code>：工作模式，含 apps / folders / urls / commands。
          </li>
          <li>
            <code>projects[]</code>：要追蹤 Git 的專案，含 path / gitReminderHours / backupReminderHours。
          </li>
          <li>Windows 路徑請使用雙反斜線，例如 <code>D:\\Projects\\codex</code>。</li>
        </ul>
      </div>
    </div>
  );
}
