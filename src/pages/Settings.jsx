import React, { useCallback, useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Dialog from '../components/Dialog.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Toggle from '../components/Toggle.jsx';
import { useToast } from '../components/Toast.jsx';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { useLocale } from '../i18n.jsx';

const inputStyle = {
  background: 'var(--input-bg)',
  color: 'var(--input-text)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-control)',
  padding: '8px 12px',
  fontSize: 'var(--fs-small)',
  fontFamily: 'var(--font-data)',
  flex: 1,
  minWidth: 220,
};

const CATEGORIES = [
  { key: 'general', label: '一般', icon: 'GE' },
  { key: 'paths', label: '路徑', icon: 'PA' },
  { key: 'startup', label: '開機/喚醒', icon: 'ST' },
  { key: 'guard', label: '監控守護', icon: 'HG' },
  { key: 'overlay', label: 'Overlay', icon: 'OS' },
  { key: 'projects', label: 'Projects', icon: 'PH' },
  { key: 'cleanup', label: '清理', icon: 'CC' },
  { key: 'automation', label: '自動化', icon: 'AU' },
  { key: 'diagnostics', label: '診斷/修復', icon: 'DX' },
  { key: 'backup', label: '備份/還原', icon: 'BK' },
];

const ACCENTS = ['#2f81f7', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

function Row({ label, desc, children }) {
  return (
    <div className="setting-row">
      <div>
        <div className="label">{label}</div>
        {desc ? <div className="desc">{desc}</div> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { accent, setAccent, compact, setCompact } = useTheme();
  const { language, setLanguage, t } = useLocale();
  const api = typeof window !== 'undefined' ? window.api : undefined;
  const apiAvailable = !!api?.getSettings;
  const zh = language === 'zh';
  const [category, setCategory] = useState('general');
  const [settings, setSettings] = useState(null);
  const [autoLaunchSupported, setAutoLaunchSupported] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [configPath, setConfigPath] = useState('');
  const [systemStatus, setSystemStatus] = useState(null);
  const [brightnessStatus, setBrightnessStatus] = useState({
    loading: false,
    supported: false,
    level: 50,
    method: 'none',
    error: '',
  });
  const [brightnessDraft, setBrightnessDraft] = useState(50);
  const [brightnessSaving, setBrightnessSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const [repairBusy, setRepairBusy] = useState('');

  const general = settings?.general || {};
  const guard = settings?.healthGuard || {};
  const cleanup = settings?.cleanup || {};
  const overlay = settings?.overlay || {};
  const projectHub = settings?.projectHub || {};

  const loadBrightness = useCallback(async () => {
    if (!api?.getBrightness) return;
    setBrightnessStatus((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await api.getBrightness();
      const nextLevel =
        result?.level !== null && result?.level !== undefined && Number.isFinite(Number(result.level))
        ? Math.max(0, Math.min(100, Math.round(Number(result.level))))
        : 50;
      setBrightnessDraft(nextLevel);
      setBrightnessStatus({
        loading: false,
        supported: result?.supported === true,
        level: nextLevel,
        method: result?.method || 'none',
        error: result?.error || '',
      });
    } catch (err) {
      setBrightnessStatus((current) => ({
        ...current,
        loading: false,
        supported: false,
        error: err?.message || '亮度狀態讀取失敗。',
      }));
    }
  }, [api]);

  const load = useCallback(async () => {
    if (!apiAvailable) return;
    const result = await api.getSettings();
    setSettings(result.settings);
    setConfigPath(result.path || '');
    const autoLaunch = await api.getAutoLaunch();
    if (autoLaunch?.ok) setAutoLaunchSupported(autoLaunch.supported);
    const status = await api.getSystemStatus?.();
    if (status?.ok) setSystemStatus(status);
    loadBrightness();
  }, [api, apiAvailable, loadBrightness]);

  useEffect(() => {
    load();
  }, [load]);

  const saveAll = async (next) => {
    setSettings(next);
    const result = await window.api.saveSettings(next);
    if (!result.ok) toast(result.error || '設定儲存失敗', 'error');
    return result;
  };

  const saveGeneral = async (patch) => {
    const next = { ...settings, general: { ...general, ...patch } };
    await saveAll(next);
  };

  const applyBrightness = async () => {
    const target = Math.max(0, Math.min(100, Math.round(Number(brightnessDraft) || 0)));
    setBrightnessSaving(true);
    setBrightnessStatus((current) => ({ ...current, error: '' }));
    try {
      const result = await window.api.setBrightness(target);
      const nextLevel =
        result?.level !== null && result?.level !== undefined && Number.isFinite(Number(result.level))
          ? Number(result.level)
          : target;
      setBrightnessDraft(nextLevel);
      setBrightnessStatus({
        loading: false,
        supported: result?.supported === true,
        level: nextLevel,
        method: result?.method || 'none',
        error: result?.error || '',
      });
      toast(
        result?.ok
          ? `亮度已調整為 ${nextLevel}%`
          : result?.error || '這台螢幕沒有開放 Windows 亮度控制。',
        result?.ok ? 'ok' : 'warn',
      );
    } catch (err) {
      const message = err?.message || '亮度調整失敗。';
      setBrightnessStatus((current) => ({
        ...current,
        loading: false,
        supported: false,
        error: message,
      }));
      toast(message, 'error');
    } finally {
      setBrightnessSaving(false);
    }
  };

  const saveCleanup = async (patch) => {
    const next = { ...settings, cleanup: { ...cleanup, ...patch } };
    await saveAll(next);
    if (window.api.cleanup?.getSettings && window.api.cleanup?.saveSettings) {
      const current = await window.api.cleanup.getSettings();
      await window.api.cleanup.saveSettings({ ...(current.settings || {}), ...patch });
    }
  };

  const saveProjectHub = async (patch) => {
    const nextHub = { ...projectHub, ...patch };
    const next = { ...settings, projectHub: nextHub };
    setSettings(next);
    const result = await window.api.saveProjectHubSettings?.(nextHub);
    if (!result?.ok) toast(result?.error || 'Project Hub settings save failed', 'error');
    else if (result.projectHub) setSettings({ ...next, projectHub: result.projectHub });
  };

  const pickProjectRoot = async () => {
    const picked = await window.api.pickPath({ type: 'folder', title: 'Add Project Hub root' });
    if (!picked?.ok || !picked.path) return;
    const result = await window.api.addProjectScanRoot?.(picked.path);
    if (result?.projectHub) setSettings({ ...settings, projectHub: result.projectHub });
  };

  const removeProjectRoot = async (root) => {
    const result = await window.api.removeProjectScanRoot?.(root);
    if (result?.projectHub) setSettings({ ...settings, projectHub: result.projectHub });
  };

  const toggleMonitorDrive = async (drive) => {
    const current = Array.isArray(general.monitorDrives) ? general.monitorDrives : [];
    const next = current.includes(drive)
      ? current.filter((item) => item !== drive)
      : [...current, drive];
    await saveGeneral({ monitorDrives: next, monitorDrive: next[0] || '' });
  };

  const toggleCleanupDay = async (day) => {
    const schedule = cleanup.schedule || {};
    const current = Array.isArray(schedule.days) ? schedule.days : [];
    const days = current.includes(day)
      ? current.filter((item) => item !== day)
      : [...current, day].sort((a, b) => a - b);
    await saveCleanup({ schedule: { ...schedule, days } });
  };

  const saveGuard = async (patch) => {
    const nextGuard = { ...guard, ...patch };
    const next = { ...settings, healthGuard: nextGuard };
    setSettings(next);
    const result = await window.api.saveHealthGuard(nextGuard);
    toast(
      result.ok ? '健康守護設定已更新' : result.error || '儲存失敗',
      result.ok ? 'ok' : 'error',
    );
  };

  const saveOverlay = async (patch) => {
    const nextOverlay = { ...overlay, ...patch };
    const next = { ...settings, overlay: nextOverlay };
    setSettings(next);
    if (window.api.overlay?.saveSettings) {
      const result = await window.api.overlay.saveSettings(patch);
      if (result?.settings) setSettings({ ...next, overlay: result.settings });
      if (!result?.ok) toast(result?.error || 'Overlay 設定儲存失敗', 'error');
      return result;
    }
    return saveAll(next);
  };

  const toggleAutoLaunch = async (enabled) => {
    const result = await window.api.setAutoLaunch(enabled);
    if (result?.ok || result?.supported) await saveGeneral({ autoLaunch: enabled });
    toast(
      result.supported
        ? enabled
          ? '已啟用開機自動啟動'
          : '已停用開機自動啟動'
        : '此環境不支援開機自動啟動',
      result.supported ? 'ok' : 'warn',
    );
  };

  const setWatchEnabled = async (enabled) => {
    await saveGeneral({ watchEnabled: enabled });
    await window.api.restartMonitor();
    toast(enabled ? '資料夾監控已啟用' : '資料夾監控已停用', 'ok');
  };

  const pickInto = async (key, type = 'folder') => {
    const result = await window.api.pickPath({ type, title: '選擇路徑' });
    if (result.ok) {
      await saveGeneral({ [key]: result.path });
      await window.api.restartMonitor();
      toast('路徑已更新', 'ok');
    }
  };

  const exportSettings = async () => {
    const result = await window.api.exportSettings();
    if (result.ok) toast(`已匯出設定：${result.path}`, 'ok');
    else if (!result.canceled) toast(result.error || '匯出失敗', 'error');
  };

  const importSettings = async () => {
    const result = await window.api.importSettings();
    if (result.ok) {
      toast('設定已匯入', 'ok');
      load();
    } else if (!result.canceled) {
      toast(result.error || '匯入失敗', 'error');
    }
  };

  const loadDiagnostics = useCallback(async () => {
    if (!api?.getDiagnostics) return;
    setDiagnosticsLoading(true);
    setDiagnosticsError('');
    try {
      const result = await api.getDiagnostics();
      if (result?.ok) setDiagnostics(result);
      else setDiagnosticsError(result?.error || '診斷資料讀取失敗');
    } catch (err) {
      setDiagnosticsError(err?.message || '診斷資料讀取失敗');
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (category === 'diagnostics') loadDiagnostics();
  }, [category, loadDiagnostics]);

  const runRepair = async (action, label) => {
    if (!window.api?.runRepair) return;
    setRepairBusy(action);
    try {
      const result = await window.api.runRepair(action);
      toast(
        result?.ok ? `${label}完成` : result?.error || `${label}失敗`,
        result?.ok ? 'ok' : 'error',
      );
    } catch (err) {
      toast(err?.message || `${label}失敗`, 'error');
    } finally {
      setRepairBusy('');
      loadDiagnostics();
    }
  };

  const resetSettings = async () => {
    setConfirmReset(false);
    const result = await window.api.resetSettings();
    toast(result.ok ? '設定已重置' : result.error || '重置失敗', result.ok ? 'ok' : 'error');
    if (result.ok) load();
  };

  const brightnessMethod =
    brightnessStatus.method === 'ddcci'
      ? 'DDC/CI'
      : brightnessStatus.method === 'wmi'
        ? 'WMI'
        : brightnessStatus.method === 'ddcci+wmi'
          ? 'DDC/CI + WMI'
          : '';
  const brightnessError =
    brightnessStatus.error === 'No brightness controller was found.'
      ? '目前螢幕沒有開放 Windows 亮度控制，可能需要在螢幕 OSD 啟用 DDC/CI。'
      : brightnessStatus.error;
  const brightnessDescription = brightnessStatus.loading
    ? '正在讀取 Windows 顯示亮度...'
    : brightnessStatus.supported
      ? `使用 ${brightnessMethod || 'Windows'} 控制目前顯示器。`
      : brightnessError || '目前螢幕沒有開放 Windows 亮度控制，可能需要在螢幕 OSD 啟用 DDC/CI。';
  const brightnessDisabled =
    brightnessStatus.loading || brightnessSaving || brightnessStatus.supported !== true;

  if (!apiAvailable) {
    return (
      <div>
        <PageHeader
          eyebrow="PREFERENCES"
          title={zh ? '設定中心' : 'Settings'}
          description={
            zh
              ? '設定需要 Electron preload 提供的桌面 API。'
              : 'Settings require the desktop API exposed by Electron preload.'
          }
        />
        <Card title={zh ? '桌面 API 無法使用' : 'Desktop API unavailable'}>
          <InlineAlert tone="warn" title="Electron IPC unavailable">
            {zh
              ? '目前是在瀏覽器 renderer 中預覽。請啟動 Electron app 來讀取、修改與儲存本機設定。'
              : 'This is the browser renderer preview. Start the Electron app to read, change, and save local settings.'}
          </InlineAlert>
        </Card>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="loading-block">
        <span className="spinner" />
        載入設定...
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="PREFERENCES"
        title="設定中心"
        description="管理路徑、開機喚醒、背景守護、自動化與備份還原。"
        actions={
          <StatusBadge tone={general.watchEnabled !== false ? 'ok' : 'warn'}>
            {general.watchEnabled !== false ? '監控啟用' : '監控停用'}
          </StatusBadge>
        }
      />

      <div className="settings-layout">
        <div className="settings-nav">
          {CATEGORIES.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${category === item.key ? 'active' : ''}`}
              onClick={() => setCategory(item.key)}
              type="button"
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="settings-content">
          {category === 'general' ? (
            <Card title="一般">
              <Row label="使用者名稱" desc="顯示在右上角個人按鈕。">
                <input
                  style={inputStyle}
                  value={general.displayName || general.userName || 'User'}
                  maxLength={32}
                  onChange={(event) =>
                    saveGeneral({ displayName: event.target.value, userName: event.target.value })
                  }
                />
              </Row>
              <Row label="桌面通知" desc="用於健康守護、自動化、清理建議與更新提醒。">
                <Toggle
                  checked={general.notifications !== false}
                  onChange={(enabled) => saveGeneral({ notifications: enabled })}
                />
              </Row>
              <Row label={t('settings.languageLabel')} desc={t('settings.languageDesc')}>
                <div className="inline-controls">
                  <Button
                    size="sm"
                    variant={language === 'zh' ? 'primary' : 'ghost'}
                    onClick={() => setLanguage('zh')}
                  >
                    {t('settings.chinese')}
                  </Button>
                  <Button
                    size="sm"
                    variant={language === 'en' ? 'primary' : 'ghost'}
                    onClick={() => setLanguage('en')}
                  >
                    {t('settings.english')}
                  </Button>
                </div>
              </Row>
              <Row label="強調色">
                <div className="swatch-row">
                  {ACCENTS.map((color) => (
                    <button
                      key={color}
                      aria-label={`Set accent color ${color}`}
                      className={`swatch ${accent === color ? 'active' : ''}`}
                      onClick={() => setAccent(color)}
                      title={color}
                      style={{ background: color }}
                      type="button"
                    />
                  ))}
                  <input
                    aria-label="Choose custom accent color"
                    type="color"
                    value={accent}
                    onChange={(event) => setAccent(event.target.value)}
                  />
                </div>
              </Row>
              <Row label="緊湊模式" desc="降低間距，讓列表與工具頁顯示更多資料。">
                <Toggle checked={compact} onChange={setCompact} />
              </Row>
              <Row label="螢幕亮度" desc={brightnessDescription}>
                <div className="inline-controls brightness-control">
                  <input
                    aria-label="調整螢幕亮度"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={brightnessDraft}
                    disabled={brightnessDisabled}
                    onChange={(event) => setBrightnessDraft(Number(event.target.value))}
                    onMouseUp={applyBrightness}
                    onTouchEnd={applyBrightness}
                    onKeyUp={(event) => {
                      if (
                        ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(
                          event.key,
                        )
                      ) {
                        applyBrightness();
                      }
                    }}
                  />
                  <span className="brightness-value">{Math.round(brightnessDraft)}%</span>
                  <Button
                    size="sm"
                    onClick={applyBrightness}
                    disabled={brightnessDisabled}
                    busy={brightnessSaving || brightnessStatus.loading}
                  >
                    套用
                  </Button>
                </div>
              </Row>
              <Row label="測試通知">
                <Button size="sm" onClick={() => window.api.testNotification()}>
                  測試
                </Button>
              </Row>
              <Row
                label="Dashboard 自動更新"
                desc="切回儀表板時先使用快取；到達間隔才重新掃描。預設 60 秒。"
              >
                <input
                  style={inputStyle}
                  type="number"
                  min="10"
                  max="3600"
                  step="5"
                  value={general.dashboardRefreshIntervalSeconds || 60}
                  onChange={(event) =>
                    saveGeneral({
                      dashboardRefreshIntervalSeconds: Math.max(
                        10,
                        Math.min(3600, Number(event.target.value) || 60),
                      ),
                    })
                  }
                />
              </Row>
            </Card>
          ) : null}

          {category === 'paths' ? (
            <Card title="路徑">
              <Row label="Downloads 路徑">
                <div className="inline-controls">
                  <input
                    style={inputStyle}
                    value={general.downloadsPath || ''}
                    onChange={(event) => saveGeneral({ downloadsPath: event.target.value })}
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      const result = await window.api.detectDownloads();
                      if (result.ok) await saveGeneral({ downloadsPath: result.path });
                    }}
                  >
                    自動偵測
                  </Button>
                  <Button size="sm" onClick={() => pickInto('downloadsPath')}>
                    選擇
                  </Button>
                </div>
              </Row>
              <Row label="Screenshots 路徑">
                <div className="inline-controls">
                  <input
                    style={inputStyle}
                    value={general.screenshotsPath || ''}
                    onChange={(event) => saveGeneral({ screenshotsPath: event.target.value })}
                  />
                  <Button size="sm" onClick={() => pickInto('screenshotsPath')}>
                    選擇
                  </Button>
                </div>
              </Row>
              <Row label="VS Code 路徑">
                <div className="inline-controls">
                  <input
                    style={inputStyle}
                    value={general.vscodePath || ''}
                    onChange={(event) => saveGeneral({ vscodePath: event.target.value })}
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      const result = await window.api.detectVSCode();
                      if (result.ok) await saveGeneral({ vscodePath: result.path });
                      toast(
                        result.ok ? `偵測到 ${result.path}` : result.error,
                        result.ok ? 'ok' : 'error',
                      );
                    }}
                  >
                    自動偵測
                  </Button>
                  <Button size="sm" onClick={() => pickInto('vscodePath', 'file')}>
                    選擇
                  </Button>
                </div>
              </Row>
              <Row
                label="自動整理 Downloads"
                desc="新檔案進入後先等待穩定，再用本機分類器整理 Downloads。"
              >
                <Toggle
                  checked={general.autoOrganizeDownloads === true}
                  onChange={(enabled) => saveGeneral({ autoOrganizeDownloads: enabled })}
                />
              </Row>
              <Row label="整理等待秒數">
                <input
                  style={inputStyle}
                  type="number"
                  min="15"
                  value={general.autoOrganizeDelaySeconds || 45}
                  onChange={(event) =>
                    saveGeneral({ autoOrganizeDelaySeconds: Number(event.target.value) })
                  }
                />
              </Row>
            </Card>
          ) : null}

          {category === 'startup' ? (
            <Card title="開機/喚醒">
              <Row
                label="開機自動啟動"
                desc={
                  autoLaunchSupported
                    ? '登入 Windows 後自動啟動 PC Life Assistant。'
                    : '目前環境不支援此設定。'
                }
              >
                <Toggle checked={general.autoLaunch !== false} onChange={toggleAutoLaunch} />
              </Row>
              <Row label="開機後顯示介面" desc="登入或重開機後直接跳出主畫面。">
                <Toggle
                  checked={general.showOnStartup !== false}
                  onChange={(enabled) =>
                    saveGeneral({ showOnStartup: enabled, startMinimized: !enabled })
                  }
                />
              </Row>
              <Row
                label="螢幕/睡眠恢復後顯示介面"
                desc="電腦喚醒、解鎖或從閒置回到使用時顯示每日工作台。"
              >
                <Toggle
                  checked={general.showOnResume !== false}
                  onChange={(enabled) => saveGeneral({ showOnResume: enabled })}
                />
              </Row>
              <Row label="關閉視窗時縮到系統匣">
                <Toggle
                  checked={general.minimizeToTray !== false}
                  onChange={(enabled) => saveGeneral({ minimizeToTray: enabled })}
                />
              </Row>
            </Card>
          ) : null}

          {category === 'guard' ? (
            <Card title="背景健康守護">
              <Row label="啟用健康守護" desc="定期檢查溫度、RAM 與磁碟容量，超過門檻會通知。">
                <Toggle
                  checked={guard.enabled !== false}
                  onChange={(enabled) => saveGuard({ enabled })}
                />
              </Row>
              <Row label="檢查間隔（分鐘）">
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  value={guard.intervalMinutes || 5}
                  onChange={(event) => saveGuard({ intervalMinutes: Number(event.target.value) })}
                />
              </Row>
              <Row label="通知冷卻（分鐘）">
                <input
                  style={inputStyle}
                  type="number"
                  min="5"
                  value={guard.cooldownMinutes || 30}
                  onChange={(event) => saveGuard({ cooldownMinutes: Number(event.target.value) })}
                />
              </Row>
              <Row label="CPU 溫度警戒（°C）">
                <input
                  style={inputStyle}
                  type="number"
                  value={guard.cpuTempC || 85}
                  onChange={(event) => saveGuard({ cpuTempC: Number(event.target.value) })}
                />
              </Row>
              <Row label="GPU 溫度警戒（°C）">
                <input
                  style={inputStyle}
                  type="number"
                  value={guard.gpuTempC || 85}
                  onChange={(event) => saveGuard({ gpuTempC: Number(event.target.value) })}
                />
              </Row>
              <Row label="RAM 使用率警戒（%）">
                <input
                  style={inputStyle}
                  type="number"
                  value={guard.ramPercent || 85}
                  onChange={(event) => saveGuard({ ramPercent: Number(event.target.value) })}
                />
              </Row>
              <Row label="磁碟剩餘容量警戒（GB）">
                <input
                  style={inputStyle}
                  type="number"
                  value={guard.diskFreeGb || 50}
                  onChange={(event) => saveGuard({ diskFreeGb: Number(event.target.value) })}
                />
              </Row>
              <Row label="立即檢查">
                <Button
                  size="sm"
                  onClick={async () => {
                    const result = await window.api.checkHealthGuardNow();
                    toast(
                      result.ok
                        ? `檢查完成，觸發 ${result.fired?.length || 0} 個通知`
                        : result.error || '檢查失敗',
                      result.ok ? 'ok' : 'error',
                    );
                  }}
                >
                  執行
                </Button>
              </Row>
            </Card>
          ) : null}

          {category === 'overlay' ? (
            <Card title="System Monitoring Overlay">
              <Row label="啟用 Overlay" desc="建立透明、置頂、預設滑鼠穿透的螢幕監控視窗。">
                <Toggle
                  checked={overlay.enabled === true}
                  onChange={(enabled) => saveOverlay({ enabled })}
                />
              </Row>
              <Row label="顯示 FPS" desc="目前保留 PresentMon / RTSS 接入口；未接入時會顯示 N/A。">
                <Toggle
                  checked={overlay.showFps !== false}
                  onChange={(showFps) => saveOverlay({ showFps })}
                />
              </Row>
              <Row label="顯示 CPU">
                <Toggle
                  checked={overlay.showCpu !== false}
                  onChange={(showCpu) => saveOverlay({ showCpu })}
                />
              </Row>
              <Row label="顯示 GPU">
                <Toggle
                  checked={overlay.showGpu !== false}
                  onChange={(showGpu) => saveOverlay({ showGpu })}
                />
              </Row>
              <Row label="顯示 RAM">
                <Toggle
                  checked={overlay.showRam !== false}
                  onChange={(showRam) => saveOverlay({ showRam })}
                />
              </Row>
              <Row label="更新頻率">
                <select
                  style={inputStyle}
                  value={overlay.updateIntervalMs || 1000}
                  onChange={(event) =>
                    saveOverlay({ updateIntervalMs: Number(event.target.value) })
                  }
                >
                  <option value={500}>500 ms</option>
                  <option value={1000}>1000 ms</option>
                  <option value={2000}>2000 ms</option>
                </select>
              </Row>
              <Row label="字體大小">
                <input
                  style={inputStyle}
                  type="number"
                  min="10"
                  max="28"
                  value={overlay.fontSize || 14}
                  onChange={(event) => saveOverlay({ fontSize: Number(event.target.value) })}
                />
              </Row>
              <Row label="透明度">
                <div className="inline-controls overlay-range">
                  <input
                    type="range"
                    min="0.35"
                    max="1"
                    step="0.05"
                    value={overlay.opacity ?? 0.92}
                    onChange={(event) => saveOverlay({ opacity: Number(event.target.value) })}
                  />
                  <span>{Math.round((overlay.opacity ?? 0.92) * 100)}%</span>
                </div>
              </Row>
              <Row label="顯示位置" desc="預設在主要螢幕左上角，日後可擴充為選擇指定螢幕。">
                <div className="inline-controls">
                  {[
                    ['top-left', '左上'],
                    ['top-right', '右上'],
                    ['bottom-left', '左下'],
                    ['bottom-right', '右下'],
                  ].map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={(overlay.position || 'top-left') === value ? 'primary' : 'ghost'}
                      onClick={() => saveOverlay({ position: value })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </Row>
              <Row
                label="滑鼠穿透"
                desc="開啟時不影響點擊其他程式；關閉後可拖曳 Overlay 位置。快捷鍵：Ctrl + Alt + Shift + O"
              >
                <Toggle
                  checked={overlay.clickThrough !== false}
                  onChange={(clickThrough) => saveOverlay({ clickThrough })}
                />
              </Row>
              <Row label="隨 App 啟動顯示" desc="保留給開機啟動流程使用；Overlay 開關會被保存。">
                <Toggle
                  checked={overlay.autoStart === true}
                  onChange={(autoStart) => saveOverlay({ autoStart })}
                />
              </Row>
              <Row label="立即控制">
                <div className="inline-controls">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await window.api.overlay?.show?.();
                      load();
                    }}
                  >
                    顯示 Overlay
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await window.api.overlay?.hide?.();
                      load();
                    }}
                  >
                    關閉 Overlay
                  </Button>
                </div>
              </Row>
            </Card>
          ) : null}

          {category === 'cleanup' ? (
            <Card title="Clean Center">
              <Row
                label="安全模式"
                desc="保守清理，避免近期暫存、Installer、Driver、Windows Update 相關檔案。"
              >
                <Toggle
                  checked={cleanup.safeMode !== false}
                  onChange={(enabled) => saveCleanup({ safeMode: enabled })}
                />
              </Row>
              <Row label="清理前顯示報告">
                <Toggle
                  checked={cleanup.showCleanupReport !== false}
                  onChange={(enabled) => saveCleanup({ showCleanupReport: enabled })}
                />
              </Row>
              <Row label="寫入詳細紀錄">
                <Toggle
                  checked={cleanup.writeDetailedLog !== false}
                  onChange={(enabled) => saveCleanup({ writeDetailedLog: enabled })}
                />
              </Row>
              <Row label="排程安全掃描">
                <Toggle
                  checked={cleanup.schedule?.enabled === true}
                  onChange={(enabled) =>
                    saveCleanup({ schedule: { ...(cleanup.schedule || {}), enabled } })
                  }
                />
              </Row>
              <Row label="清理頻率">
                <select
                  style={inputStyle}
                  value={cleanup.schedule?.frequency || 'daily'}
                  onChange={(event) =>
                    saveCleanup({
                      schedule: { ...(cleanup.schedule || {}), frequency: event.target.value },
                    })
                  }
                >
                  <option value="daily">每日</option>
                  <option value="weekly">每週</option>
                </select>
              </Row>
              <Row label="排程時間">
                <input
                  style={inputStyle}
                  type="time"
                  value={cleanup.schedule?.time || '09:00'}
                  onChange={(event) =>
                    saveCleanup({
                      schedule: { ...(cleanup.schedule || {}), time: event.target.value },
                    })
                  }
                />
              </Row>
              <Row label="執行日">
                <div className="inline-controls">
                  {['日', '一', '二', '三', '四', '五', '六'].map((label, day) => (
                    <Button
                      key={label}
                      size="sm"
                      variant={(cleanup.schedule?.days || []).includes(day) ? 'primary' : 'ghost'}
                      onClick={() => toggleCleanupDay(day)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </Row>
              <Row label="排程通知">
                <Toggle
                  checked={cleanup.schedule?.notify !== false}
                  onChange={(notify) =>
                    saveCleanup({ schedule: { ...(cleanup.schedule || {}), notify } })
                  }
                />
              </Row>
              <Row label="自動清理安全項目" desc="只處理 Clean Center 預設勾選的安全項目。">
                <Toggle
                  checked={cleanup.schedule?.autoCleanSafe === true}
                  onChange={(autoCleanSafe) =>
                    saveCleanup({ schedule: { ...(cleanup.schedule || {}), autoCleanSafe } })
                  }
                />
              </Row>
            </Card>
          ) : null}

          {category === 'projects' ? (
            <Card title="Project Hub">
              <Row label="Scan roots">
                <div className="summary-list">
                  {(projectHub.scanRoots || []).map((root) => (
                    <div className="summary-row" key={root}>
                      <span>{root}</span>
                      <Button size="sm" variant="ghost" onClick={() => removeProjectRoot(root)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" onClick={pickProjectRoot}>
                    Add root
                  </Button>
                </div>
              </Row>
              <Row label="Exclude folders">
                <input
                  style={inputStyle}
                  value={(projectHub.excludeFolders || []).join(', ')}
                  onChange={(event) =>
                    saveProjectHub({
                      excludeFolders: event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Row>
              <Row label="Max depth">
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  max="5"
                  value={projectHub.maxDepth || 2}
                  onChange={(event) => saveProjectHub({ maxDepth: Number(event.target.value) })}
                />
              </Row>
            </Card>
          ) : null}

          {category === 'automation' ? (
            <Card title="自動化">
              <Row label="資料夾監控">
                <Toggle checked={general.watchEnabled !== false} onChange={setWatchEnabled} />
              </Row>
              <Row label="啟用自動化規則">
                <Toggle
                  checked={general.automationsEnabled !== false}
                  onChange={(enabled) => saveGeneral({ automationsEnabled: enabled })}
                />
              </Row>
              <Row label="保留操作歷史">
                <Toggle
                  checked={general.keepHistory !== false}
                  onChange={(enabled) => saveGeneral({ keepHistory: enabled })}
                />
              </Row>
              <Row
                label="Ask before organizing"
                desc="Show a notification before automatic Downloads sorting moves files."
              >
                <Toggle
                  checked={general.askBeforeOrganizing !== false}
                  onChange={(askBeforeOrganizing) => saveGeneral({ askBeforeOrganizing })}
                />
              </Row>
              <Row label="Monitor drives">
                <div className="inline-controls">
                  {(systemStatus?.metrics?.disks || []).map((disk) => (
                    <Button
                      key={disk.drive}
                      size="sm"
                      variant={
                        (general.monitorDrives || []).includes(disk.drive) ? 'primary' : 'ghost'
                      }
                      onClick={() => toggleMonitorDrive(disk.drive)}
                    >
                      {disk.drive}
                    </Button>
                  ))}
                </div>
              </Row>
            </Card>
          ) : null}

          {category === 'diagnostics' ? (
            <Card
              title="診斷 / 修復"
              actions={
                <Button size="sm" variant="ghost" onClick={loadDiagnostics} busy={diagnosticsLoading}>
                  重新整理
                </Button>
              }
            >
              {diagnosticsError ? (
                <InlineAlert tone="danger" title="診斷失敗">
                  {diagnosticsError}
                </InlineAlert>
              ) : null}
              {!diagnostics && diagnosticsLoading ? (
                <div className="loading-block">
                  <span className="spinner" />
                  正在收集診斷資料...
                </div>
              ) : null}
              {diagnostics ? (
                <>
                  <Row label="App 版本">
                    <StatusBadge tone="ok">v{diagnostics.appVersion}</StatusBadge>
                  </Row>
                  <Row label="工作流" desc="視覺化工作流總數 / 啟用中數量。">
                    <span>
                      {diagnostics.workflows?.total ?? 0} 個，啟用{' '}
                      {diagnostics.workflows?.enabled ?? 0} 個
                    </span>
                  </Row>
                  <Row label="自動化規則" desc="傳統自動化規則總數 / 啟用中數量。">
                    <span>
                      {diagnostics.automations?.total ?? 0} 個，啟用{' '}
                      {diagnostics.automations?.enabled ?? 0} 個
                    </span>
                  </Row>
                  <Row label="最近一次工作流執行">
                    <span>
                      {diagnostics.lastWorkflowRunAt
                        ? new Date(diagnostics.lastWorkflowRunAt).toLocaleString()
                        : '尚未執行過'}
                    </span>
                  </Row>
                  <Row label="本機資料存取" desc={diagnostics.settingsPath || ''}>
                    <StatusBadge tone={diagnostics.storage?.ok ? 'ok' : 'danger'}>
                      {diagnostics.storage?.ok
                        ? '正常'
                        : `異常：${diagnostics.storage?.error || '無法讀寫設定檔'}`}
                    </StatusBadge>
                  </Row>
                  <Row label="排程服務" desc="自動化排程 / 工作流排程 / 清理排程計時器。">
                    <StatusBadge
                      tone={
                        diagnostics.scheduler?.automationTimer &&
                        diagnostics.scheduler?.workflowTimer &&
                        diagnostics.scheduler?.cleanupTimer
                          ? 'ok'
                          : 'warn'
                      }
                    >
                      {diagnostics.scheduler?.automationTimer &&
                      diagnostics.scheduler?.workflowTimer &&
                      diagnostics.scheduler?.cleanupTimer
                        ? '執行中'
                        : '部分停止（可用下方「重新載入排程」修復）'}
                    </StatusBadge>
                  </Row>
                  <Row label="資料夾監控">
                    <StatusBadge
                      tone={
                        diagnostics.watcher?.enabled && !diagnostics.watcher?.paused ? 'ok' : 'warn'
                      }
                    >
                      {!diagnostics.watcher?.enabled
                        ? '已停用'
                        : diagnostics.watcher?.paused
                          ? '已暫停'
                          : `監控中（${diagnostics.watcher?.watched ?? 0} 個資料夾）`}
                    </StatusBadge>
                  </Row>
                  <Row
                    label="重新載入排程"
                    desc="重建排程計時器與資料夾監控。排程看起來沒有在跑時先用這個。"
                  >
                    <Button
                      size="sm"
                      busy={repairBusy === 'reloadSchedules'}
                      onClick={() => runRepair('reloadSchedules', '重新載入排程')}
                    >
                      執行
                    </Button>
                  </Row>
                  <Row
                    label="清除排程快取"
                    desc="清除「上次觸發時間」記錄。排程規則卡住不觸發時使用；下一輪會重新計時。"
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      busy={repairBusy === 'clearScheduleState'}
                      onClick={() => runRepair('clearScheduleState', '清除排程快取')}
                    >
                      清除
                    </Button>
                  </Row>
                  <Row
                    label="重新初始化本機設定"
                    desc="用預設值補齊缺漏欄位並修正格式，不會刪除你的規則、工作流與偏好。"
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      busy={repairBusy === 'reinitSettings'}
                      onClick={() => runRepair('reinitSettings', '重新初始化設定')}
                    >
                      執行
                    </Button>
                  </Row>
                  <Row label="開啟診斷 Logs" desc="所有紀錄僅保存在本機。">
                    <Button size="sm" variant="ghost" onClick={() => window.api.openLogs()}>
                      開啟
                    </Button>
                  </Row>
                </>
              ) : null}
            </Card>
          ) : null}

          {category === 'backup' ? (
            <Card title="備份/還原">
              <Row label="匯出設定">
                <Button size="sm" onClick={exportSettings}>
                  匯出
                </Button>
              </Row>
              <Row label="匯入設定">
                <Button size="sm" onClick={importSettings}>
                  匯入
                </Button>
              </Row>
              <Row label="重置設定">
                <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>
                  重置
                </Button>
              </Row>
              <Row label="開啟 Logs">
                <Button size="sm" onClick={() => window.api.openLogs()}>
                  開啟
                </Button>
              </Row>
              <Row label="設定檔位置" desc={configPath}>
                <Button size="sm" onClick={() => window.api.openSettingsFile()}>
                  開啟設定檔
                </Button>
              </Row>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog
        open={confirmReset}
        title="重置設定"
        message="這會把 App 設定還原為預設值，但不會刪除你的檔案。"
        confirmLabel="重置"
        cancelLabel="取消"
        danger
        onConfirm={resetSettings}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
