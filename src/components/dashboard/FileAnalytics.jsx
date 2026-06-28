import React from 'react';
import { useLocale } from '../../i18n.jsx';
import BarMini from '../viz/BarMini.jsx';

function timeAgo(value) {
  if (!value) return '--';
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta)) return '--';
  const minutes = Math.max(0, Math.round(delta / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function tempLevel(value) {
  if (value == null) return 'normal';
  if (value >= 90) return 'danger';
  if (value >= 78) return 'warning';
  return 'good';
}

function formatTemp(value) {
  return value == null ? '--' : `${value}°C`;
}

function normalizeCoreTemp(core, index) {
  if (typeof core === 'number') {
    return {
      id: `core-${index + 1}`,
      name: `C${index + 1}`,
      temperatureC: core,
    };
  }

  return {
    ...core,
    id: core?.id || core?.name || `core-${index + 1}`,
    name: core?.name || `C${index + 1}`,
    temperatureC: Number(core?.temperatureC),
  };
}

function normalizePinned(projects = {}) {
  return (projects.pinnedProjects || []).slice(0, 5);
}

function extensionBars(files) {
  return Object.entries(files?.extensionGroups || {})
    .map(([label, stats]) => ({
      label,
      value: Number(stats?.count || 0),
      sizeBytes: Number(stats?.sizeBytes || 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

export default function FileAnalytics({ files, projects, system, notifications, onNavigate }) {
  const { t } = useLocale();
  const pinnedProjects = normalizePinned(projects);
  const cpuCores = (system?.metrics?.temperatures?.cpuCores || [])
    .slice(0, 10)
    .map(normalizeCoreTemp)
    .filter((core) => Number.isFinite(core.temperatureC));
  const cpuBars = cpuCores.map((core, index) => ({
    label: core.name || `C${index + 1}`,
    value: core.temperatureC,
  }));
  const typeBars = extensionBars(files);
  const recentProjects = (projects?.recentProjects || []).slice(0, 5);
  const notices = (notifications?.events || []).slice(0, 5);

  return (
    <div className="dashboard-bottom-grid dashboard-bottom-focus">
      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.pinnedProjects')}</span>
          <button type="button" onClick={() => onNavigate('projects')}>
            {t('dashboard.hub')}
          </button>
        </div>
        <div className="project-mini-list">
          {pinnedProjects.length ? (
            pinnedProjects.map((project) => (
              <button
                type="button"
                key={project.path || project.name}
                onClick={() => onNavigate('projects')}
              >
                <strong>{project.name || 'Project'}</strong>
                <span>{project.path || t('dashboard.unavailable')}</span>
              </button>
            ))
          ) : (
            <div className="dash-empty compact">
              <strong>{t('dashboard.noPinnedProjects')}</strong>
              <span>{t('dashboard.noPinnedProjectsHint')}</span>
            </div>
          )}
        </div>
      </section>

      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.cpuCoreTemps')}</span>
          <button type="button" onClick={() => onNavigate('monitor')}>
            {t('dashboard.open')}
          </button>
        </div>
        {cpuCores.length ? (
          <>
            <BarMini items={cpuBars} max={100} unit="°C" emptyTitle={t('dashboard.noCpuTemps')} />
            <div className="cpu-core-grid">
              {cpuCores.slice(0, 4).map((core, index) => (
                <div
                  className={`cpu-core-tile tone-${tempLevel(core.temperatureC)} ${core.stabilized ? 'is-stabilized' : ''}`}
                  key={core.id || core.name || index}
                  title={
                    core.rawTemperatureC == null
                      ? undefined
                      : `Raw ${formatTemp(core.rawTemperatureC)} / samples ${core.sampleCount || 1}`
                  }
                >
                  <span>{core.name || `Core ${index + 1}`}</span>
                  <strong>{formatTemp(core.temperatureC)}</strong>
                  {typeof core.loadPercent === 'number' ? <em>{core.loadPercent}% load</em> : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="dash-empty compact">
            <strong>{t('dashboard.noCpuTemps')}</strong>
            <span>{t('dashboard.noCpuTempsHint')}</span>
          </div>
        )}
      </section>

      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.fileTypeDistribution')}</span>
          <button type="button" onClick={() => onNavigate('files')}>
            {t('dashboard.organize')}
          </button>
        </div>
        <BarMini items={typeBars} emptyTitle={t('dashboard.noClassifiedFiles')} />
      </section>

      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.recentActiveProjects')}</span>
          <button type="button" onClick={() => onNavigate('projects')}>
            {t('dashboard.hub')}
          </button>
        </div>
        <div className="project-mini-list">
          {recentProjects.length ? (
            recentProjects.map((project) => (
              <button
                type="button"
                key={project.path || project.name}
                onClick={() => onNavigate('projects')}
              >
                <strong>{project.name}</strong>
                <span>
                  {project.category || 'Project'} ·{' '}
                  {project.totalFileCount || project.detectedFileCount || 0} {t('dashboard.files')}{' '}
                  · {timeAgo(project.lastModified)}
                </span>
              </button>
            ))
          ) : (
            <div className="dash-empty compact">
              <strong>{t('dashboard.noProjects')}</strong>
              <span>{t('dashboard.noProjectsHint')}</span>
            </div>
          )}
        </div>
      </section>

      <section className="glass-card dashboard-panel">
        <div className="panel-heading">
          <span>{t('dashboard.notificationMessages')}</span>
          <button type="button" onClick={() => onNavigate('notifications')}>
            {t('dashboard.viewAll')}
          </button>
        </div>
        <div className="notice-list">
          {notices.length ? (
            notices.map((notice) => (
              <button
                type="button"
                className={`notice-row level-${notice.level || 'info'} ${notice.read ? 'is-read' : ''}`}
                key={notice.id}
                onClick={() => onNavigate('notifications')}
              >
                <i />
                <span>
                  <strong>{notice.title || 'PC Life Assistant'}</strong>
                  <em>{notice.body || notice.source || '--'}</em>
                </span>
                <time>{timeAgo(notice.time)}</time>
              </button>
            ))
          ) : (
            <div className="dash-empty compact">
              <strong>{t('dashboard.noNotifications')}</strong>
              <span>{t('dashboard.noNotificationsHint')}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
