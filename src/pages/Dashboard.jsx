import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AlertList from '../components/AlertList.jsx';
import Button from '../components/Button.jsx';
import DataTable from '../components/DataTable.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import StatusCard from '../components/StatusCard.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatGB, formatUptime, usageLevel } from '../utils/format.js';

function healthTone(score) {
  if (score >= 80) return 'ok';
  if (score >= 60) return 'warn';
  return 'danger';
}

function healthLabel(score) {
  if (score >= 80) return '狀態穩定';
  if (score >= 60) return '需要留意';
  return '需要處理';
}

function tempLevel(value) {
  if (value == null) return 'muted';
  if (value >= 90) return 'danger';
  if (value >= 78) return 'warn';
  return 'ok';
}

function formatTemp(value) {
  return value == null ? '--' : `${value}°C`;
}

function buildDailyAlerts(status, cleanup, pinnedProjects) {
  const alerts = [];
  const health = status?.health;
  const downloads = status?.downloads;
  const disk = (status?.metrics?.disks || []).find((item) => item.ok);
  const temperatures = status?.metrics?.temperatures;
  const projects = status?.git?.projects || [];

  if (health && health.score < 70) {
    alerts.push({
      level: 'warn',
      title: '健康分數偏低',
      desc: '建議查看健康檢查，確認 CPU、RAM、磁碟空間或 Git 提醒。',
    });
  }

  if (downloads?.ok && downloads.count > 20) {
    alerts.push({
      level: 'warn',
      title: 'Downloads 待整理',
      desc: `目前有 ${downloads.count} 個項目，建議先掃描再確認整理。`,
    });
  }

  if (disk?.freePercent != null && disk.freePercent < 20) {
    alerts.push({
      level: 'danger',
      title: '磁碟空間不足',
      desc: `${disk.drive} 剩餘 ${disk.freePercent}%，建議執行 Clean Center 掃描。`,
    });
  }

  const hotCpu = (temperatures?.cpuCores || []).filter((sensor) => sensor.temperatureC >= 90);
  const hotGpu = (temperatures?.gpu || []).filter((sensor) => sensor.temperatureC >= 88);
  if (hotCpu.length) {
    alerts.push({
      level: 'danger',
      title: 'CPU 溫度偏高',
      desc: `${hotCpu.length} 個 CPU 感測器超過 90°C，建議檢查散熱與背景負載。`,
    });
  }
  if (hotGpu.length) {
    alerts.push({
      level: 'danger',
      title: 'GPU 溫度偏高',
      desc: `${hotGpu[0].name} 目前 ${hotGpu[0].temperatureC}°C，建議檢查顯卡負載與風扇。`,
    });
  }

  const dirtyProjects = projects.filter((project) => !project.error && project.modifiedCount > 0);
  if (dirtyProjects.length) {
    alerts.push({
      level: 'info',
      title: 'Git 有未提交變更',
      desc: `${dirtyProjects.length} 個專案有變更，建議進 Project Hub 檢查。`,
    });
  }

  if (!pinnedProjects.length) {
    alerts.push({
      level: 'info',
      title: '尚未釘選常用專案',
      desc: '到 Project Hub 釘選常用專案後，每日工作台會顯示快速入口。',
    });
  }

  if (cleanup?.recommendations?.length) {
    alerts.push({
      level: 'info',
      title: 'Clean Center 有建議',
      desc: cleanup.recommendations[0].title || '建議檢查暫存、快取或大檔案。',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      level: 'ok',
      title: '今天看起來很乾淨',
      desc: '目前沒有需要立即處理的提醒。',
    });
  }

  return alerts;
}

export default function Dashboard({ onNavigate }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [settings, setSettings] = useState(null);
  const [cleanup, setCleanup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyProject, setBusyProject] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!window.api) {
      setError('Electron API 尚未載入，請使用安裝版 App。');
      setLoading(false);
      return;
    }

    // allSettled so one failing IPC doesn't reject the whole refresh (which would
    // leave the dashboard stuck on the loading state). Missing values fall back to null.
    const settled = await Promise.allSettled([
      window.api.getSystemStatus(),
      window.api.getMonitorState(),
      window.api.getSettings(),
      window.api.cleanup?.getSummary ? window.api.cleanup.getSummary() : Promise.resolve(null),
    ]);
    const [systemResult, monitorResult, settingsResult, cleanupResult] =
      settled.map((entry) => (entry.status === 'fulfilled' ? entry.value : null));

    if (systemResult?.ok) {
      setStatus(systemResult);
      setError('');
    } else {
      setError(systemResult?.error || '讀取系統狀態失敗');
    }
    if (monitorResult?.ok) setMonitor(monitorResult);
    if (settingsResult?.ok) setSettings(settingsResult.settings);
    if (cleanupResult?.ok) setCleanup(cleanupResult);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  const metrics = status?.metrics;
  const health = status?.health;
  const firstDisk = (metrics?.disks || []).find((disk) => disk.ok);
  const dDrive = (metrics?.disks || []).find((disk) => disk.ok && /^d:\\?$/i.test(String(disk.drive || '').replace(/\//g, '\\')));
  const temperatures = metrics?.temperatures || {};
  const cpuCoreTemps = temperatures.cpuCores || [];
  const gpuTemps = temperatures.gpu || [];
  const hottestCpu = cpuCoreTemps.reduce((max, item) => Math.max(max, item.temperatureC || 0), 0);
  const hottestGpu = gpuTemps.reduce((max, item) => Math.max(max, item.temperatureC || 0), 0);
  const paused = !!monitor?.paused;
  const pinnedProjects = settings?.projectHub?.pinnedProjects || [];
  const alerts = useMemo(() => buildDailyAlerts(status, cleanup, pinnedProjects), [status, cleanup, pinnedProjects]);
  const history = settings?.history || [];
  const dirtyProjects = (status?.git?.projects || []).filter((project) => !project.error && project.modifiedCount > 0);

  const toggleMonitor = async () => {
    const result = await window.api.setMonitorPaused(!paused);
    toast(result.paused ? '監控已暫停' : '監控已恢復', 'ok');
    refresh();
  };

  const runPinnedProject = async (project, action) => {
    setBusyProject(`${project.path}:${action}`);
    const result = await window.api.runProjectAction({
      projectName: project.name,
      projectPath: project.path,
      isFile: project.isFile,
      action,
    });
    setBusyProject('');
    toast(result.ok ? result.message || '專案動作已完成' : result.error || '專案動作失敗', result.ok ? 'ok' : 'error');
  };

  return (
    <div className="dashboard-page">
      <PageHeader
        eyebrow="HOME"
        title="每日工作台"
        description="把今天需要處理的整理、監控、Git、磁碟與常用專案入口集中在這裡。"
        actions={(
          <>
            <StatusBadge tone={paused ? 'warn' : 'ok'}>{paused ? '監控暫停' : '監控中'}</StatusBadge>
            <Button variant="ghost" onClick={refresh} busy={loading}>重新整理</Button>
          </>
        )}
      />

      {error ? <InlineAlert tone="danger" title="讀取失敗">{error}</InlineAlert> : null}

      <section className="daily-hero">
        <div className="daily-score card">
          <div className={`score-ring ${healthTone(health?.score || 0)}`}>
            <strong>{health?.score ?? '--'}</strong>
            <span>/100</span>
          </div>
          <div>
            <div className="panel-label">健康分數</div>
            <h2>{health?.status || healthLabel(health?.score || 0)}</h2>
            <p>{metrics ? `${metrics.hostname}，已運作 ${formatUptime(metrics.uptimeSeconds)}` : '正在讀取系統指標'}</p>
            <div className="head-actions">
              <Button size="sm" variant="primary" onClick={() => onNavigate('health')}>查看健康檢查</Button>
              <Button size="sm" onClick={() => onNavigate('setup')}>開啟設定精靈</Button>
            </div>
          </div>
        </div>

        <div className="daily-actions card">
          <div className="panel-label">一鍵操作</div>
          <div className="quick-action-grid">
            <button type="button" onClick={() => onNavigate('files')}><strong>整理 Downloads</strong><span>先掃描，再確認移動檔案</span></button>
            <button type="button" onClick={() => onNavigate('screenshots')}><strong>整理 Screenshots</strong><span>依日期與來源整理截圖</span></button>
            <button type="button" onClick={() => onNavigate('cleanup')}><strong>掃描 Clean Center</strong><span>檢查暫存、快取與大檔</span></button>
            <button type="button" onClick={() => onNavigate('projects')}><strong>開啟 Project Hub</strong><span>搜尋、釘選與檢查 Git</span></button>
            <button type="button" onClick={toggleMonitor}><strong>{paused ? '恢復監控' : '暫停監控'}</strong><span>控制背景監控狀態</span></button>
            <button type="button" onClick={() => onNavigate('workspaceTemplates')}><strong>建立工作區</strong><span>用多語言模板開新專案</span></button>
          </div>
        </div>
      </section>

      <div className="metric-grid">
        <StatusCard
          label="Downloads 待整理"
          icon="DL"
          value={status?.downloads?.ok ? `${status.downloads.count}` : '--'}
          sub={status?.downloads?.path || '尚未設定路徑'}
        />
        <StatusCard
          label="釘選專案"
          icon="PIN"
          value={`${pinnedProjects.length}`}
          sub={pinnedProjects.length ? '已加入每日工作台' : '尚未釘選'}
        />
        <StatusCard
          label="Git 提醒"
          icon="GT"
          value={`${dirtyProjects.length}`}
          sub={dirtyProjects.length ? '有未提交變更' : '目前沒有提醒'}
        />
        <StatusCard
          label="D 槽剩餘"
          icon="D:"
          value={dDrive ? formatGB(dDrive.free) : '--'}
          sub={dDrive ? `D:\\ 剩餘 ${dDrive.freePercent}% / 總量 ${formatGB(dDrive.total)}` : '未偵測到 D 槽'}
          barPercent={dDrive ? dDrive.usedPercent : 0}
          barLevel={dDrive && dDrive.freePercent < 20 ? 'danger' : dDrive && dDrive.freePercent < 35 ? 'warn' : 'ok'}
        />
        <StatusCard
          label="CPU"
          icon="CPU"
          value={metrics ? `${metrics.cpu.usagePercent}%` : '--'}
          barPercent={metrics ? metrics.cpu.usagePercent : 0}
          barLevel={metrics ? usageLevel(metrics.cpu.usagePercent) : 'ok'}
        />
        <StatusCard
          label="CPU 最高溫"
          icon="TMP"
          value={hottestCpu ? formatTemp(hottestCpu) : '--'}
          sub={cpuCoreTemps.length ? `${cpuCoreTemps.length} 個 CPU 感測器` : '未偵測到 CPU 溫度，請保持 Core Temp 執行'}
          barPercent={hottestCpu ? Math.min(100, hottestCpu) : 0}
          barLevel={tempLevel(hottestCpu || null)}
        />
        <StatusCard
          label="GPU 溫度"
          icon="GPU"
          value={hottestGpu ? formatTemp(hottestGpu) : '--'}
          sub={gpuTemps.length ? gpuTemps.map((item) => item.name).join(' / ') : temperatures.message || '未偵測到 GPU 溫度'}
          barPercent={hottestGpu ? Math.min(100, hottestGpu) : 0}
          barLevel={tempLevel(hottestGpu || null)}
        />
        <StatusCard
          label="RAM"
          icon="RAM"
          value={metrics ? `${metrics.memory.usagePercent}%` : '--'}
          sub={metrics ? `${formatGB(metrics.memory.usedBytes)} / ${formatGB(metrics.memory.totalBytes)}` : ''}
          barPercent={metrics ? metrics.memory.usagePercent : 0}
          barLevel={metrics ? usageLevel(metrics.memory.usagePercent) : 'ok'}
        />
        <StatusCard
          label="磁碟剩餘"
          icon="DSK"
          value={firstDisk ? formatGB(firstDisk.free) : '--'}
          sub={firstDisk ? `${firstDisk.drive} 剩餘 ${firstDisk.freePercent}%` : '沒有磁碟資料'}
          barPercent={firstDisk ? firstDisk.usedPercent : 0}
          barLevel={firstDisk && firstDisk.freePercent < 20 ? 'danger' : 'ok'}
        />
      </div>

      <div className="dashboard-columns">
        <SectionPanel title="CPU 10 核溫度" description="顯示最多 10 個 CPU 核心或封裝溫度感測器。資料來源通常是 LibreHardwareMonitor / OpenHardwareMonitor。">
          {cpuCoreTemps.length ? (
            <div className="temperature-grid">
              {cpuCoreTemps.slice(0, 10).map((sensor, index) => (
                <div className={`temperature-tile ${tempLevel(sensor.temperatureC)}`} key={sensor.id || `${sensor.name}-${index}`}>
                  <span>{sensor.name || `Core ${index + 1}`}</span>
                  <strong>{formatTemp(sensor.temperatureC)}</strong>
                  {typeof sensor.loadPercent === 'number' ? <em>{sensor.loadPercent}% load</em> : null}
                </div>
              ))}
            </div>
          ) : (
            <InlineAlert tone="info" title="尚未偵測到 CPU 每核心溫度">
              請保持 Core Temp 執行，並在 Core Temp Advanced Settings 啟用 shared memory；也可改用 LibreHardwareMonitor 或 OpenHardwareMonitor。
            </InlineAlert>
          )}
        </SectionPanel>

        <SectionPanel title="GPU 顯卡溫度" description="會優先讀取 NVIDIA nvidia-smi，也會嘗試 LibreHardwareMonitor / OpenHardwareMonitor。">
          {gpuTemps.length ? (
            <div className="temperature-grid">
              {gpuTemps.map((sensor, index) => (
                <div className={`temperature-tile ${tempLevel(sensor.temperatureC)}`} key={sensor.id || `${sensor.name}-${index}`}>
                  <span>{sensor.name || `GPU ${index + 1}`}</span>
                  <strong>{formatTemp(sensor.temperatureC)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <InlineAlert tone="info" title="尚未偵測到 GPU 溫度">
              如果你是 NVIDIA 顯卡，請確認 `nvidia-smi` 可執行；其他顯卡可透過 LibreHardwareMonitor / OpenHardwareMonitor 提供溫度資料。
            </InlineAlert>
          )}
        </SectionPanel>
      </div>

      <div className="dashboard-columns">
        <SectionPanel title="釘選專案" description="把最常用的專案固定在每日工作台，可直接開 VS Code 或資料夾。">
          {pinnedProjects.length ? (
            <div className="pinned-project-list">
              {pinnedProjects.slice(0, 6).map((project) => (
                <div className="pinned-project-card" key={project.path}>
                  <div>
                    <strong>{project.name}</strong>
                    <span>{project.path}</span>
                  </div>
                  <div className="head-actions">
                    <Button size="sm" busy={busyProject === `${project.path}:openVSCode`} onClick={() => runPinnedProject(project, 'openVSCode')}>VS Code</Button>
                    <Button size="sm" busy={busyProject === `${project.path}:openFolder`} onClick={() => runPinnedProject(project, 'openFolder')}>資料夾</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <InlineAlert tone="info" title="尚未釘選專案">
              前往 Project Hub，按專案卡片左側的 ADD/PIN 按鈕即可釘選。
            </InlineAlert>
          )}
          <div className="head-actions" style={{ marginTop: 14 }}>
            <Button size="sm" onClick={() => onNavigate('projects')}>管理釘選</Button>
          </div>
        </SectionPanel>

        <SectionPanel title="今天建議處理" description="所有提醒都會附上下一步入口，避免只顯示警告卻不知道要做什麼。">
          <AlertList alerts={alerts} />
          <div className="head-actions" style={{ marginTop: 14 }}>
            <Button size="sm" onClick={() => onNavigate('cleanup')}>前往 Clean Center</Button>
            <Button size="sm" onClick={() => onNavigate('projects')}>查看 Git 狀態</Button>
          </div>
        </SectionPanel>
      </div>

      <SectionPanel title="最近自動化與整理紀錄">
        <DataTable
          rows={history.slice(0, 6)}
          emptyTitle="尚無整理紀錄"
          emptyDescription="完成一次 Downloads 或 Screenshots 整理後，這裡會顯示最近結果。"
          columns={[
            { key: 'at', label: '時間', render: (row) => new Date(row.at || Date.now()).toLocaleString() },
            { key: 'moved', label: '移動', render: (row) => row.moved ?? '--' },
            { key: 'failed', label: '失敗', render: (row) => row.failed ?? 0 },
            { key: 'sample', label: '摘要', render: (row) => (row.sample || []).join(' / ') || '--' },
          ]}
        />
      </SectionPanel>
    </div>
  );
}
