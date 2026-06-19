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
