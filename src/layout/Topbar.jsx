import React, { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useTheme } from '../theme/ThemeProvider.jsx';

const THEME_LABEL = { system: '系統', light: '淺色', dark: '深色' };
const THEME_ICON = { system: 'SY', light: 'LT', dark: 'DK' };

export default function Topbar({ title, onOpenPalette, onNavigate }) {
  const { theme, cycleTheme } = useTheme();
  const [monitor, setMonitor] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!window.api) return undefined;
    let mounted = true;
    const refresh = async () => {
      const [monitorResult, updateResult, notificationResult] = await Promise.all([
        window.api.getMonitorState().catch(() => null),
        window.api.getUpdateStatus().catch(() => null),
        window.api.listNotifications ? window.api.listNotifications().catch(() => null) : null,
      ]);
      if (!mounted) return;
      if (monitorResult?.ok) setMonitor(monitorResult);
      if (updateResult?.ok) setUpdateStatus(updateResult.status);
      if (notificationResult?.ok) setUnread(notificationResult.unreadCount || 0);
    };
    refresh();
    const id = setInterval(refresh, 10000);
    const offMonitor = window.api.onMonitoringChanged ? window.api.onMonitoringChanged(refresh) : null;
    const offUpdate = window.api.onUpdateEvent ? window.api.onUpdateEvent(refresh) : null;
    const offAutomation = window.api.onAutomationFired ? window.api.onAutomationFired(refresh) : null;
    return () => {
      mounted = false;
      clearInterval(id);
      if (offMonitor) offMonitor();
      if (offUpdate) offUpdate();
      if (offAutomation) offAutomation();
    };
  }, []);

  const updateDownloaded = !!(updateStatus && updateStatus.downloaded);

  return (
    <header className="topbar">
      <div>
        <div className="tb-kicker">PC Life Assistant</div>
        <div className="tb-title">{title}</div>
      </div>
      <button type="button" className="tb-search" onClick={onOpenPalette} title="搜尋與命令 (Ctrl+K)">
        <svg className="mag" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <line x1="10.5" y1="10.5" x2="14" y2="14" strokeLinecap="round" />
        </svg>
        <span className="tb-search-text">搜尋任何項目、專案或指令…</span>
        <span className="kbd">Ctrl K</span>
      </button>
      <div className="tb-actions">
        <StatusBadge tone={monitor && monitor.paused ? 'warn' : 'ok'}>
          {monitor && monitor.paused ? '監控暫停' : '監控中'}
        </StatusBadge>
        {updateDownloaded ? <StatusBadge tone="warn">更新已下載</StatusBadge> : null}
        <Button variant="ghost" size="sm" icon="NC" onClick={() => onNavigate && onNavigate('notifications')} title="通知中心">
          {unread ? `${unread} 通知` : '通知'}
        </Button>
        <Button variant="ghost" size="sm" icon="K" onClick={onOpenPalette} title="搜尋與命令 (Ctrl+K)">
          搜尋
        </Button>
        <Button variant="ghost" size="sm" icon={THEME_ICON[theme]} onClick={cycleTheme} title="切換主題">
          {THEME_LABEL[theme]}
        </Button>
      </div>
    </header>
  );
}
