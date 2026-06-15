import React, { useCallback, useEffect, useState } from 'react';
import StatusCard from '../components/StatusCard.jsx';
import ActionButton from '../components/ActionButton.jsx';
import { formatGB, formatUptime, usageLevel } from '../utils/format.js';

export default function HealthMonitor() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!window.api) {
      setError('無法連接 Electron 主程序。');
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await window.api.getSystemStatus();
    if (res.ok) {
      setStatus(res);
      setError('');
    } else {
      setError(res.error || '讀取失敗');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [refresh]);

  const metrics = status && status.metrics;
  const health = status && status.health;
  const projects = (status && status.git && status.git.projects) || [];

  return (
    <div>
      <div className="row-between">
        <div>
          <h1 className="page-title">健康監控 / Git</h1>
          <p className="page-subtitle">CPU / RAM / 磁碟 / 開機時間，以及專案 Git 狀態。</p>
        </div>
        <ActionButton icon="🔄" busy={loading} onClick={refresh}>
          重新整理
        </ActionButton>
      </div>

      {error ? <div className="error-banner">⚠️ {error}</div> : null}

      {health ? (
        <div className="card health-hero">
          <div>
            <div className="muted">PC Health Score</div>
            <div className="health-score">
              {health.score} <small>/ 100</small>
            </div>
          </div>
          <div>
            <span
              className={`badge ${
                health.score >= 80 ? 'ok' : health.score >= 60 ? 'warn' : 'danger'
              }`}
            >
              狀態：{health.status}
            </span>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {health.deductions.length === 0
                ? '沒有扣分項目。'
                : health.deductions.map((d) => `${d.reason} (${d.points})`).join('；')}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card-grid">
        <StatusCard
          label="CPU"
          icon="🧠"
          value={metrics ? `${metrics.cpu.usagePercent}%` : '—'}
          sub={metrics ? `${metrics.cpu.cores} 核心${metrics.cpu.sustainedHigh ? ' · 持續偏高' : ''}` : ''}
          barPercent={metrics ? metrics.cpu.usagePercent : 0}
          barLevel={metrics ? usageLevel(metrics.cpu.usagePercent) : 'ok'}
        />
        <StatusCard
          label="RAM"
          icon="💾"
          value={metrics ? `${metrics.memory.usagePercent}%` : '—'}
          sub={metrics ? `${formatGB(metrics.memory.usedBytes)} / ${formatGB(metrics.memory.totalBytes)}` : ''}
          barPercent={metrics ? metrics.memory.usagePercent : 0}
          barLevel={metrics ? usageLevel(metrics.memory.usagePercent) : 'ok'}
        />
        {(metrics && metrics.disks ? metrics.disks : []).map((d, i) =>
          d.ok ? (
            <StatusCard
              key={i}
              label={`磁碟 ${d.drive}`}
              icon="🗄️"
              value={formatGB(d.free)}
              sub={`剩餘 ${d.freePercent}% · 共 ${formatGB(d.total)}`}
              barPercent={d.usedPercent}
              barLevel={d.freePercent < 20 ? 'danger' : 'ok'}
            />
          ) : (
            <StatusCard key={i} label={`磁碟 ${d.drive}`} icon="🗄️" value="—" sub={d.error || '無法讀取'} />
          )
        )}
        <StatusCard
          label="開機時間"
          icon="⏱️"
          value={metrics ? formatUptime(metrics.uptimeSeconds) : '—'}
          sub={metrics ? metrics.hostname : ''}
        />
      </div>

      <div className="section-title">Git / 備份提醒</div>
      {projects.length === 0 ? (
        <div className="card">
          <p className="muted">尚未設定任何專案。請到「設定」頁面新增 projects。</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>專案</th>
                <th>Git Repo</th>
                <th>未 commit</th>
                <th>距上次 commit</th>
                <th>提醒</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => (
                <tr key={i}>
                  <td>
                    <div>{p.name}</div>
                    <div className="path">{p.path}</div>
                  </td>
                  <td>{p.error ? <span className="status-error">✕</span> : <span className="status-ok">✓</span>}</td>
                  <td>{p.isGitRepo ? `${p.modifiedCount} 個` : '—'}</td>
                  <td>
                    {p.hoursSinceCommit !== null
                      ? `${Math.floor(p.hoursSinceCommit)} 小時前`
                      : '—'}
                  </td>
                  <td className="muted">
                    {p.error
                      ? p.error
                      : p.messages.length > 0
                      ? p.messages.join('；')
                      : '✅ 一切正常'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
