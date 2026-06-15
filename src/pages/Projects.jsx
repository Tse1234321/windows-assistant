import React, { useCallback, useEffect, useState } from 'react';
import ActionButton from '../components/ActionButton.jsx';

const ACTIONS = [
  { key: 'openFolder', icon: '📂', label: '開啟資料夾' },
  { key: 'openVSCode', icon: '🆚', label: 'VS Code' },
  { key: 'openTerminal', icon: '💻', label: 'Terminal' },
  { key: 'runDev', icon: '▶️', label: 'npm run dev' },
  { key: 'gitStatus', icon: '🔧', label: 'Git status' },
];

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    if (!window.api) {
      setError('無法連接 Electron 主程序。');
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await window.api.listProjects();
    setProjects(res.projects || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const doAction = async (projectName, action) => {
    setBusy(`${projectName}:${action}`);
    setToast(null);
    const res = await window.api.runProjectAction({ projectName, action });
    setBusy('');
    if (action === 'gitStatus' && res.ok) {
      const s = res.status;
      setToast({
        type: 'ok',
        msg: `${s.name}：${s.isGitRepo ? `${s.modifiedCount} 個未 commit` : '非 git repo'}${
          s.messages && s.messages.length ? ` · ${s.messages.join('；')}` : ''
        }`,
      });
      load();
    } else {
      setToast({
        type: res.ok ? 'ok' : 'error',
        msg: res.ok ? res.message || '完成' : res.error || '失敗',
      });
    }
  };

  return (
    <div>
      <div className="row-between">
        <div>
          <h1 className="page-title">Project Hub</h1>
          <p className="page-subtitle">集中管理 config 內的專案，並一鍵開啟工具。</p>
        </div>
        <ActionButton icon="🔄" busy={loading} onClick={load}>
          重新整理
        </ActionButton>
      </div>

      {error ? <div className="error-banner">⚠️ {error}</div> : null}
      {toast ? <div className={`toast ${toast.type}`} style={{ marginBottom: 16 }}>{toast.msg}</div> : null}

      {projects.length === 0 && !loading ? (
        <div className="card">
          <p className="muted">尚未設定任何專案。請到「設定」頁面新增 projects。</p>
        </div>
      ) : (
        <div className="card-grid" style={{ gridTemplateColumns: '1fr' }}>
          {projects.map((p, idx) => (
            <div className="card" key={idx}>
              <div className="row-between">
                <div className="section-title" style={{ margin: 0 }}>
                  📁 {p.name}
                </div>
                <div>
                  {!p.exists ? (
                    <span className="badge danger">路徑不存在</span>
                  ) : p.isGitRepo ? (
                    <span className="badge ok">Git Repo</span>
                  ) : (
                    <span className="badge warn">非 Git</span>
                  )}
                </div>
              </div>
              <div className="path" style={{ marginBottom: 10 }}>{p.path}</div>

              {p.error ? (
                <div className="error-banner" style={{ marginBottom: 10 }}>⚠️ {p.error}</div>
              ) : (
                <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
                  未 commit：{p.isGitRepo ? `${p.modifiedCount} 個` : '—'} ·{' '}
                  上次 commit：
                  {p.hoursSinceCommit !== null ? ` ${Math.floor(p.hoursSinceCommit)} 小時前` : ' —'}
                  {p.messages && p.messages.length ? ` · ${p.messages.join('；')}` : ''}
                </div>
              )}

              <div className="button-row" style={{ marginBottom: 0 }}>
                {ACTIONS.map((a) => (
                  <ActionButton
                    key={a.key}
                    icon={a.icon}
                    busy={busy === `${p.name}:${a.key}`}
                    disabled={!p.exists}
                    onClick={() => doAction(p.name, a.key)}
                  >
                    {a.label}
                  </ActionButton>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
