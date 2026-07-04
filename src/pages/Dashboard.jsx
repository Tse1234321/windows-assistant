import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';

// Three.js is ~520 KB — load the decorative globe after first paint instead
// of blocking app startup on it.
const DashboardGlobe = lazy(() => import('../components/dashboard/DashboardGlobe.jsx'));
import FileAnalytics from '../components/dashboard/FileAnalytics.jsx';
import RecentActivities from '../components/dashboard/RecentActivities.jsx';
import StatCard from '../components/dashboard/StatCard.jsx';
import SystemOverview from '../components/dashboard/SystemOverview.jsx';
import { usePollingEffect } from '../hooks/usePollingEffect.js';
import InlineAlert from '../components/InlineAlert.jsx';
import { useLocale } from '../i18n.jsx';
import {
  getCachedDashboardStats,
  getDashboardStats,
  isDashboardCacheFresh,
} from '../services/dashboardService.js';
import { formatBytes } from '../utils/format.js';

const DEFAULT_REFRESH_INTERVAL_MS = 60 * 1000;

function normalizeRefreshIntervalMs(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return DEFAULT_REFRESH_INTERVAL_MS;
  return Math.max(10, Math.min(3600, Math.round(seconds))) * 1000;
}

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
  const [data, setData] = useState(() => getCachedDashboardStats());
  const [loading, setLoading] = useState(() => !getCachedDashboardStats());
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(DEFAULT_REFRESH_INTERVAL_MS);

  useEffect(() => {
    let alive = true;
    window.api
      ?.getSettings?.()
      .then((result) => {
        if (!alive) return;
        setRefreshIntervalMs(
          normalizeRefreshIntervalMs(result?.settings?.general?.dashboardRefreshIntervalSeconds),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(
    async (options = {}) => {
      const force = options.force === true;
      if (!force && isDashboardCacheFresh(refreshIntervalMs)) {
        const cached = getCachedDashboardStats();
        if (cached) {
          setData(cached);
          setLoading(false);
          return cached;
        }
      }

      setLoading((current) => current || !data || force);
      const result = await getDashboardStats({ force, maxAgeMs: refreshIntervalMs }).catch(
        (err) => ({
          ok: false,
          error: err.message,
        }),
      );
      if (result?.ok) {
        setData(result);
        setError('');
      } else {
        setError(result?.error || 'Dashboard data is unavailable.');
      }
      setLoading(false);
      return result;
    },
    [data, refreshIntervalMs],
  );

  usePollingEffect(refresh, refreshIntervalMs, [refresh, refreshIntervalMs]);

  const stats = useMemo(() => data?.stats || {}, [data?.stats]);
  const metrics = useMemo(() => data?.system?.metrics || {}, [data?.system?.metrics]);
  const nodes = useMemo(() => data?.nodes || [], [data?.nodes]);
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

  const statusCounts = useMemo(() => {
    const counts = { good: 0, normal: 0, warning: 0, danger: 0 };
    for (const node of nodes) if (counts[node.status] != null) counts[node.status] += 1;
    return counts;
  }, [nodes]);

  const toggleStatusFilter = useCallback((status) => {
    setStatusFilter((current) => {
      const next = new Set(current || []);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      if (!next.size || next.size >= 4) return null;
      return [...next];
    });
  }, []);

  const legendItems = [
    ['good', t('dashboard.good')],
    ['normal', t('dashboard.normal')],
    ['warning', t('dashboard.attention')],
    ['danger', t('dashboard.danger')],
  ];

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
            <button type="button" onClick={() => refresh({ force: true })} disabled={loading}>
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
          <Suspense fallback={<div className="loading-block">{t('dashboard.loadingNodes')}</div>}>
            <DashboardGlobe
              nodes={nodes}
              loading={loading && !data}
              selectedNode={selectedNode}
              onNodeSelect={setSelectedNode}
              onNodeClear={handleNodeClear}
              onNodeOpen={handleNodeOpen}
              liveMetrics={{
                cpuPercent: metrics.cpu?.usagePercent,
                memoryPercent: metrics.memory?.usagePercent,
              }}
              statusFilter={statusFilter}
            />
          </Suspense>
          <div className="node-legend glass-card" title={t('dashboard.legendHint')}>
            {legendItems.map(([status, label]) => {
              const active = !statusFilter || statusFilter.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  className={`legend-chip${active ? '' : ' legend-chip-off'}`}
                  aria-pressed={active}
                  onClick={() => toggleStatusFilter(status)}
                >
                  <i className={`legend-${status}`} />
                  {label}
                  <em>{statusCounts[status]}</em>
                </button>
              );
            })}
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
