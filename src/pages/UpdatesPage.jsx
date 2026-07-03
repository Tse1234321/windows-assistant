import React, { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useLocale } from '../i18n.jsx';
import { useToast } from '../components/Toast.jsx';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

function statusTone(status) {
  if (status?.downloaded) return 'ok';
  if (status?.checking || status?.downloading) return 'warn';
  if (status?.error) return 'danger';
  return 'ok';
}

export default function UpdatesPage() {
  const { language } = useLocale();
  const { toast } = useToast();
  const text =
    language === 'zh'
      ? {
          title: '更新中心',
          description: '檢查目前版本，並在更新下載完成後重新啟動安裝。',
          current: '目前版本',
          version: '版本',
          channel: '通道',
          state: '狀態',
          ready: '就緒',
          available: '可更新',
          downloaded: '已下載',
          check: '檢查更新',
          checking: '檢查中...',
          checkDone: '更新檢查完成',
          checkFailed: '更新檢查失敗',
          install: '重新啟動安裝',
          installFailed: '安裝失敗',
          error: '更新錯誤',
          events: '更新事件',
          event: '事件',
          noEvents: '尚無更新事件',
          noEventsHint: '檢查結果與下載進度會顯示在這裡。',
        }
      : {
          title: 'Updates',
          description:
            'Check the local app version and install a downloaded update when one is ready.',
          current: 'Current build',
          version: 'Version',
          channel: 'Channel',
          state: 'State',
          ready: 'Ready',
          available: 'Available',
          downloaded: 'Downloaded',
          check: 'Check for updates',
          checking: 'Checking...',
          checkDone: 'Update check complete',
          checkFailed: 'Update check failed',
          install: 'Restart to install',
          installFailed: 'Install failed',
          error: 'Update error',
          events: 'Update events',
          event: 'Event',
          noEvents: 'No update events',
          noEventsHint: 'Checks and download progress will appear here.',
        };
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState([]);

  const refresh = async () => {
    const result = await window.api.getUpdateStatus?.();
    if (result?.status) setStatus(result.status);
  };

  useEffect(() => {
    refresh();
    const off = window.api.onUpdateEvent?.((event) => {
      setEvents((list) => [event, ...list].slice(0, 8));
      refresh();
    });
    return () => off?.();
  }, []);

  const check = async () => {
    setBusy(true);
    const result = await window.api.checkForUpdates?.();
    setBusy(false);
    if (result?.status) setStatus(result.status);
    toast(
      result?.ok === false ? result.error || text.checkFailed : text.checkDone,
      result?.ok === false ? 'error' : 'ok',
    );
  };

  const install = async () => {
    const result = await window.api.installUpdate?.();
    if (result?.ok === false) toast(result.error || text.installFailed, 'error');
  };

  return (
    <div>
      <PageHeader
        eyebrow="UPDATES"
        title={text.title}
        description={text.description}
        actions={<StatusBadge tone={statusTone(status)}>{status?.message || text.ready}</StatusBadge>}
      />

      <Card title={text.current}>
        <div className="metric-grid">
          <div className="status-card">
            <span>{text.version}</span>
            <strong>{APP_VERSION}</strong>
          </div>
          <div className="status-card">
            <span>{text.channel}</span>
            <strong>{status?.dev ? 'Development' : 'Stable'}</strong>
          </div>
          <div className="status-card">
            <span>{text.state}</span>
            <strong>{status?.downloaded ? text.downloaded : status?.available ? text.available : text.ready}</strong>
          </div>
        </div>
        {status?.error ? (
          <InlineAlert tone="danger" title={text.error}>
            {status.error}
          </InlineAlert>
        ) : null}
        <div className="head-actions">
          <Button size="sm" onClick={check} disabled={busy}>
            {busy ? text.checking : text.check}
          </Button>
          <Button size="sm" variant="primary" onClick={install} disabled={!status?.downloaded}>
            {text.install}
          </Button>
        </div>
      </Card>

      <Card title={text.events}>
        {events.length ? (
          <div className="summary-list">
            {events.map((event, index) => (
              <div className="summary-row" key={`${event.type || 'event'}-${index}`}>
                <strong>{event.type || text.event}</strong>
                <span>{event.message || event.version || ''}</span>
              </div>
            ))}
          </div>
        ) : (
          <InlineAlert tone="info" title={text.noEvents}>
            {text.noEventsHint}
          </InlineAlert>
        )}
      </Card>
    </div>
  );
}
