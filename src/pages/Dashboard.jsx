import React, { useCallback, useEffect, useState } from 'react';
import StatusCard from '../components/StatusCard.jsx';
import ActionButton from '../components/ActionButton.jsx';
import AlertList from '../components/AlertList.jsx';
import { formatGB, formatUptime, usageLevel } from '../utils/format.js';

function buildAlerts(status) {
  const alerts = [];
  if (!status) return alerts;

  const downloads = status.downloads || {};
  if (downloads.ok && downloads.count > 0) {
    alerts.push({
      level: downloads.count > 50 ? 'warn' : 'info',
      title: `Downloads 有 ${downloads.count} 個未分類檔案`,
      desc: '前往「整理 Downloads」可以預覽並分類。',
    });
  }

  const projects = (status.git && status.git.projects) || [];
  for (const p of projects) {
    if (p.error) {
      alerts.push({ level: 'info', title: `${p.name}：${p.error}`, desc: p.path });
    } else if (p.gitReminder || p.backupReminder) {
      alerts.push({
        level: p.backupReminder ? 'danger' : 'warn',
        title: `${p.name} 專案需要注意`,
        desc: p.messages.join('；'),
      });
    }
  }

  const deductions = (status.health && status.health.deductions) || [];
  for (const d of deductions) {
    alerts.push({ level: 'warn', title: 'Health Score 扣分', desc: `${d.reason} (${d.points})` });
  }

  return alerts;
}

export default function Dashboard({ onNavigate }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [runningMode, setRunningMode] = useState(false);
  const [modeToast, setModeToast] = useState('');

  const refresh = useCallback(async () => {
    if (!window.api) {
      setError('無法連接 Electron 主程序（請在桌面 App 內執行）。');
      setLoading(false);
      return;
    }
    const res = await window.api.getSystemStatus();
    if (res.ok) {
      setStatus(res);
      setError('');
    } else {
      setError(res.error || '讀取系統狀態失敗');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const runProgrammingMode = async () => {
    setRunningMode(true);
    setModeToast('');
    const modes = await window.api.listModes();
    const first = modes.modes && modes.modes[0];
    if (!first) {
      setModeToast('尚未設定任何工作模式，請到「設定」新增。');
      setRunningMode(false);
      return;
    }
    const result = await window.api.runMode(first.name);
    const failed = (result.steps || []).filter((s) => s.status === 'error').length;
    setModeToast(
      result.ok
        ? `「${result.mode}」已啟動，共 ${result.steps.length} 個步驟。`
        : `「${result.mode}」已執行，但有 ${failed} 個步驟失敗（詳見工作模式頁）。`
    );
    setRunningMode(false);
  };

  const health = status && status.health;
  const metrics = status && status.metrics;
  const healthLevel =
    health && health.score >= 80 ? 'ok' : health && health.score >= 60 ? 'warn' : 'danger';

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">
        今日狀態摘要 {loading ? <span className="spinner" /> : null}
      </p>

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
            <span className={`badge ${healthLevel}`}>狀態：{health.status}</span>
          </div>
        </div>
      ) : null}

      <div className="card-grid">
        <StatusCard
          label="CPU 使用率"
          icon="🧠"
          value={metrics ? `${metrics.cpu.usagePercent}%` : '—'}
          sub={metrics ? `${metrics.cpu.cores} 核心` : ''}
          barPercent={metrics ? metrics.cpu.usagePercent : 0}
          barLevel={metrics ? usageLevel(metrics.cpu.usagePercent) : 'ok'}
        />
        <StatusCard
          label="RAM 使用率"
          icon="💾"
          value={metrics ? `${metrics.memory.usagePercent}%` : '—'}
          sub={
            metrics
              ? `${formatGB(metrics.memory.usedBytes)} / ${formatGB(metrics.memory.totalBytes)}`
              : ''
          }
          barPercent={metrics ? metrics.memory.usagePercent : 0}
          barLevel={metrics ? usageLevel(metrics.memory.usagePercent) : 'ok'}
        />
        <StatusCard
          label="硬碟剩餘空間"
          icon="🗄️"
          value={metrics && metrics.disk.ok ? `${formatGB(metrics.disk.freeBytes)}` : '—'}
          sub={metrics && metrics.disk.ok ? `剩餘 ${metrics.disk.freePercent}% · ${metrics.disk.drive}` : '無法讀取'}
          barPercent={metrics && metrics.disk.ok ? 100 - metrics.disk.freePercent : 0}
          barLevel={metrics && metrics.disk.ok && metrics.disk.freePercent < 20 ? 'danger' : 'ok'}
        />
        <StatusCard
          label="Downloads 未分類"
          icon="🗂️"
          value={status && status.downloads.ok ? `${status.downloads.count}` : '—'}
          sub={status && status.downloads.ok ? '個檔案待整理' : '無法讀取資料夾'}
        />
      </div>

      <div className="row-between">
        <div className="section-title">Quick Modes</div>
        <div className="muted">開機時間：{metrics ? formatUptime(metrics.uptimeSeconds) : '—'}</div>
      </div>
      <div className="button-row">
        <ActionButton variant="primary" icon="🚀" busy={runningMode} onClick={runProgrammingMode}>
          寫程式模式
        </ActionButton>
        <ActionButton icon="🗂️" onClick={() => onNavigate('files')}>
          整理 Downloads
        </ActionButton>
        <ActionButton icon="🔧" onClick={() => onNavigate('health')}>
          檢查 Git 狀態
        </ActionButton>
        <ActionButton variant="ghost" icon="⚙️" onClick={() => onNavigate('settings')}>
          開啟設定
        </ActionButton>
      </div>
      {modeToast ? <div className="toast ok">{modeToast}</div> : null}

      <div className="section-title" style={{ marginTop: 24 }}>
        Alerts
      </div>
      <AlertList alerts={buildAlerts(status)} />
    </div>
  );
}
