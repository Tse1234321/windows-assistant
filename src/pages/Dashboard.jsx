import React, { useCallback, useMemo, useState } from 'react';
import DashboardGlobe from '../components/dashboard/DashboardGlobe.jsx';
import FileAnalytics from '../components/dashboard/FileAnalytics.jsx';
import RecentActivities from '../components/dashboard/RecentActivities.jsx';
import StatCard from '../components/dashboard/StatCard.jsx';
import SystemOverview from '../components/dashboard/SystemOverview.jsx';
import { usePollingEffect } from '../hooks/usePollingEffect.js';
import InlineAlert from '../components/InlineAlert.jsx';
import { useLocale } from '../i18n.jsx';
import { getDashboardStats } from '../services/dashboardService.js';
import { formatBytes } from '../utils/format.js';

function healthTone(score) {
  if (score == null) return 'normal';
  if (score >= 82) return 'good';
  if (score >= 62) return 'warning';
  return 'danger';
}

function dataTone(value, warning = 75, danger = 90) {
  if (value == null) return 'normal';
  if (value >= danger) return 'danger';
  if (value >= warning) return 'warning';
  return 'good';
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not available';
}

function pickNode(nodes, id) {
  return (nodes || []).find((node) => node.id === id);
}

export default function Dashboard({ onNavigate }) {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getDashboardStats().catch((err) => ({ ok: false, error: err.message }));
    if (result?.ok) {
      setData(result);
      setError('');
    } else {
      setError(result?.error || 'Dashboard data is unavailable.');
    }
    setLoading(false);
  }, []);

  usePollingEffect(refresh, 30000, [refresh]);

  const stats = useMemo(() => data?.stats || {}, [data?.stats]);
  const metrics = useMemo(() => data?.system?.metrics || {}, [data?.system?.metrics]);
  const nodes = data?.nodes || [];
  const storageNode = pickNode(nodes, 'system-storage');
  const tempNode = pickNode(nodes, 'cleanup-temp-files');

  const highlights = useMemo(
    () => [
      {
        label: t('dashboard.totalFiles'),
        icon: 'F',
        value: stats.totalFiles,
        sub: stats.totalFileBytes
          ? formatBytes(stats.totalFileBytes)
          : t('dashboard.liveFolderScan'),
        onClick: () => onNavigate('files'),
      },
      {
        label: t('dashboard.storageUsed'),
        icon: 'S',
        value: stats.storageUsedPercent,
        format: 'percent',
        tone: dataTone(stats.storageUsedPercent),
        sub: stats.storageUsedBytes
          ? formatBytes(stats.storageUsedBytes)
          : t('dashboard.unavailable'),
        onClick: () => onNavigate('monitor'),
      },
      {
        label: t('dashboard.cpuUsage'),
        icon: 'C',
        value: metrics.cpu?.usagePercent,
        format: 'percent',
        tone: dataTone(metrics.cpu?.usagePercent),
        sub: `${metrics.cpu?.cores || '--'} cores`,
        onClick: () => onNavigate('monitor'),
      },
      {
        label: t('dashboard.ramUsage'),
        icon: 'R',
        value: metrics.memory?.usagePercent,
        format: 'percent',
        tone: dataTone(metrics.memory?.usagePercent),
        sub: metrics.memory
          ? `${formatBytes(metrics.memory.usedBytes)} / ${formatBytes(metrics.memory.totalBytes)}`
          : t('dashboard.unavailable'),
        onClick: () => onNavigate('monitor'),
      },
      {
        label: t('dashboard.systemHealth'),
        icon: 'H',
        value: stats.systemHealth,
        tone: healthTone(stats.systemHealth),
        sub: t('dashboard.healthScore'),
        onClick: () => onNavigate('health'),
      },
      {
        label: t('dashboard.organizedToday'),
        icon: 'O',
        value: stats.organizedToday,
        tone: stats.organizedToday ? 'good' : 'normal',
        sub: t('dashboard.activityHistory'),
        onClick: () => onNavigate('history'),
      },
    ],
    [metrics, onNavigate, stats, t],
  );

  const handleNodeOpen = useCallback(
    (node) => {
      if (!node?.route) return;
      onNavigate(node.route);
    },
    [onNavigate],
  );

  const handleNodeClear = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div className="dashboard-page-v3">
      <section className="dashboard-hero-v3 dashboard-command-head">
        <div className="hero-copy">
          <span className="hero-kicker">{t('dashboard.kicker')}</span>
          <h1>{t('dashboard.title')}</h1>
          <p>{t('dashboard.subtitle')}</p>
          <div className="hero-meta">
            <span>
              {t('dashboard.updated')} {formatDateTime(data?.generatedAt)}
            </span>
            <button type="button" onClick={refresh} disabled={loading}>
              {loading ? t('dashboard.refreshing') : t('dashboard.refresh')}
            </button>
          </div>
        </div>
        <div className="hero-status glass-card">
          <span>{t('dashboard.systemStatus')}</span>
          <strong className={`status-text-${healthTone(stats.systemHealth)}`}>
            {stats.systemHealth ?? '--'}
          </strong>
          <em>
            {tempNode?.sizeBytes != null
              ? `${formatBytes(tempNode.sizeBytes)} ${t('dashboard.tempFiles')}`
              : t('dashboard.tempUnavailable')}
          </em>
        </div>
      </section>

      {error ? (
        <InlineAlert tone="danger" title={t('dashboard.dataUnavailableTitle')}>
          {error}
        </InlineAlert>
      ) : null}

      <div className="dashboard-kpi-strip">
        {highlights.map((item) => (
          <StatCard key={item.label} loading={loading && !data} {...item} />
        ))}
      </div>

      <div className="dashboard-main-grid dashboard-command-grid">
        <SystemOverview data={data} onNavigate={onNavigate} />
        <div className="dashboard-center">
          <DashboardGlobe
            nodes={nodes}
            loading={loading && !data}
            selectedNode={selectedNode}
            onNodeSelect={setSelectedNode}
            onNodeClear={handleNodeClear}
            onNodeOpen={handleNodeOpen}
          />
          <div className="node-legend glass-card">
            <span>
              <i className="legend-good" />
              {t('dashboard.good')}
            </span>
            <span>
              <i className="legend-normal" />
              {t('dashboard.normal')}
            </span>
            <span>
              <i className="legend-warning" />
              {t('dashboard.attention')}
            </span>
            <span>
              <i className="legend-danger" />
              {t('dashboard.danger')}
            </span>
            <strong>
              {nodes.length} {t('dashboard.liveNodes')}
            </strong>
          </div>
        </div>
        <FileAnalytics
          files={data?.files}
          projects={data?.projects}
          system={data?.system}
          notifications={data?.notifications}
          onNavigate={onNavigate}
        />
      </div>

      <RecentActivities activities={data?.activities || []} onNavigate={onNavigate} />

      {storageNode?.meta?.unavailable || data?.unavailable?.length ? (
        <div className="dashboard-unavailable glass-card">
          <strong>{t('dashboard.unavailableFields')}</strong>
          <span>
            {(data?.unavailable || []).map((item) => `${item.key}: ${item.reason}`).join(' · ') ||
              'Some backend data is not currently exposed.'}
          </span>
        </div>
      ) : null}
    </div>
  );
}
