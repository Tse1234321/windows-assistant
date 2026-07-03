import React from 'react';
import { formatBytes } from '../../utils/format.js';
import { useLocale } from '../../i18n.jsx';
import RingGauge from '../viz/RingGauge.jsx';

function levelClass(value) {
  if (value == null) return 'muted';
  if (value >= 90) return 'danger';
  if (value >= 75) return 'warning';
  return 'good';
}

function MetricRow({ label, value, detail, unavailable, suffix = '%' }) {
  const { t } = useLocale();
  const percent = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div className={`overview-row ${unavailable ? 'is-unavailable' : ''}`}>
      <div>
        <strong>{label}</strong>
        <span>{unavailable ? t('dashboard.noNetwork') : detail}</span>
      </div>
      <em>{unavailable ? '--' : `${typeof value === 'number' ? value : percent}${suffix}`}</em>
      <div className="overview-meter" aria-hidden="true">
        <i className={levelClass(value)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function SystemOverview({ data, onNavigate }) {
  const { t } = useLocale();
  const metrics = data?.system?.metrics;
  const cleanup = data?.system?.cleanup;
  const health = data?.system?.health;
  const disk = (metrics?.disks || []).find((item) => item.ok);
  const memory = metrics?.memory;
  const diskDetail = disk
    ? `${disk.drive} ${formatBytes(disk.used)} / ${formatBytes(disk.total)}`
    : t('dashboard.unavailable');
  const network = metrics?.network;
  const networkUnavailable = !network?.available;
  const warmupText = t('dashboard.networkWarmup');
  const networkDetail = networkUnavailable
    ? warmupText === 'dashboard.networkWarmup'
      ? '正在建立網路取樣'
      : warmupText
    : `↓ ${network.rxMbps || 0} Mbps / ↑ ${network.txMbps || 0} Mbps`;

  return (
    <aside className="dashboard-side-stack">
      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.liveSystem')}</span>
          <button type="button" onClick={() => onNavigate('monitor')}>
            {t('dashboard.open')}
          </button>
        </div>
        <div className="health-chip">
          <span>{t('dashboard.systemHealth')}</span>
          <strong>{health?.score ?? '--'}</strong>
        </div>
        <div className="overview-gauge-row">
          <RingGauge
            label={t('dashboard.storage')}
            value={disk?.usedPercent}
            detail={diskDetail}
            empty={!disk || disk.usedPercent == null}
          />
          <div className="overview-gauge-copy">
            <strong>{disk?.drive || t('dashboard.storage')}</strong>
            <span>{diskDetail}</span>
          </div>
        </div>
        <MetricRow
          label="CPU"
          value={metrics?.cpu?.usagePercent}
          detail={`${metrics?.cpu?.cores || '--'} cores`}
        />
        <MetricRow
          label={t('dashboard.memory')}
          value={memory?.usagePercent}
          detail={
            memory ? `${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}` : ''
          }
        />
        <MetricRow label={t('dashboard.storage')} value={disk?.usedPercent} detail={diskDetail} />
        <MetricRow
          label={t('dashboard.network')}
          value={network?.totalMbps || 0}
          detail={networkDetail}
          suffix=" Mbps"
          unavailable={networkUnavailable}
        />
      </section>

      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.cleanupState')}</span>
          <button type="button" onClick={() => onNavigate('cleanup')}>
            {t('dashboard.review')}
          </button>
        </div>
        <div className="cleanup-state-grid">
          <div>
            <span>{t('dashboard.tempFiles')}</span>
            <strong>
              {cleanup?.tempSize != null
                ? formatBytes(cleanup.tempSize)
                : t('dashboard.unavailable')}
            </strong>
          </div>
          <div>
            <span>{t('dashboard.recycleBin')}</span>
            <strong>
              {cleanup?.recycleBin?.size != null
                ? formatBytes(cleanup.recycleBin.size)
                : t('dashboard.unavailable')}
            </strong>
          </div>
          <div>
            <span>{t('dashboard.lastCleanup')}</span>
            <strong>
              {cleanup?.lastCleanupTime
                ? new Date(cleanup.lastCleanupTime).toLocaleDateString()
                : t('dashboard.none')}
            </strong>
          </div>
          <div>
            <span>{t('dashboard.recommendations')}</span>
            <strong>
              {cleanup?.hasRecommendations ? t('dashboard.action') : t('dashboard.clear')}
            </strong>
          </div>
        </div>
      </section>
    </aside>
  );
}
