import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PathPickerRow from '../components/PathPickerRow.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

const STEPS = [
  { key: 'downloads', label: 'Downloads' },
  { key: 'screenshots', label: 'Screenshots' },
  { key: 'projects', label: '專案路徑' },
  { key: 'tools', label: '選配工具' },
  { key: 'monitor', label: '監控' },
  { key: 'summary', label: '完成' },
];

function upsertRoot(roots, nextRoot) {
  if (!nextRoot) return roots || [];
  const seen = new Set();
  return [...(roots || []), nextRoot].filter((root) => {
    const key = String(root).toLowerCase();
    if (!root || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ToolCheckCard({
  title,
  status,
  description,
  details,
  primaryAction,
  secondaryAction,
  busy,
}) {
  const tone = status === 'ready' ? 'ok' : status === 'warn' ? 'warn' : 'muted';
  const label = status === 'ready' ? '已就緒' : status === 'warn' ? '需要設定' : '選用';
  return (
    <div className={`setup-tool-card ${status || 'optional'}`}>
      <div className="setup-tool-copy">
        <div className="setup-tool-heading">
          <strong>{title}</strong>
          <StatusBadge tone={tone}>{label}</StatusBadge>
        </div>
        <p>{description}</p>
        {details ? <span>{details}</span> : null}
      </div>
      <div className="head-actions">
        {secondaryAction ? (
          <Button size="sm" variant="ghost" onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        ) : null}
        {primaryAction ? (
          <Button size="sm" variant="primary" onClick={primaryAction.onClick} busy={busy}>
            {primaryAction.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function SetupWizard({ onNavigate }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [toolStatus, setToolStatus] = useState(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [installingCoreTemp, setInstallingCoreTemp] = useState(false);
  const [error, setError] = useState('');

  const loadTools = useCallback(async () => {
    if (!window.api?.setupTools?.getStatus) return;
    const result = await window.api.setupTools.getStatus();
    if (result?.ok) setToolStatus(result);
  }, []);

  const load = useCallback(async () => {
    if (!window.api) return;
    const [settingsResult, statusResult] = await Promise.all([
      window.api.getSettings(),
      window.api.getSetupStatus ? window.api.getSetupStatus() : Promise.resolve(null),
    ]);
    if (settingsResult.ok) setSettings(settingsResult.settings);
    if (statusResult?.ok) setSetupStatus(statusResult);
    await loadTools();
  }, [loadTools]);

  useEffect(() => {
    load();
  }, [load]);

  const general = useMemo(() => settings?.general || {}, [settings?.general]);
  const projectHub = useMemo(() => settings?.projectHub || {}, [settings?.projectHub]);
  const projectRoots = useMemo(
    () => (Array.isArray(projectHub.scanRoots) ? projectHub.scanRoots : []),
    [projectHub.scanRoots],
  );

  const updateGeneral = (patch) => {
    setSettings((prev) => ({
      ...(prev || {}),
      general: { ...((prev || {}).general || {}), ...patch },
    }));
  };

  const updateProjectHub = (patch) => {
    setSettings((prev) => ({
      ...(prev || {}),
      projectHub: { ...((prev || {}).projectHub || {}), ...patch },
    }));
  };

  const pickFolder = async (title, apply) => {
    const result = await window.api.pickPath({ type: 'folder', title });
    if (result.ok) apply(result.path);
  };

  const detectDownloads = async () => {
    const result = await window.api.detectDownloads();
    if (result.ok && result.path) updateGeneral({ downloadsPath: result.path });
    else toast(result.error || '找不到 Downloads 路徑，請手動選擇。', 'error');
  };

  const installCoreTemp = async () => {
    setInstallingCoreTemp(true);
    const result = await window.api?.setupTools?.installCoreTemp?.();
    if (result?.ok) {
      toast(result.alreadyInstalled ? 'Core Temp 已安裝' : 'Core Temp 安裝完成', 'ok');
    } else if (result?.needsManualInstall) {
      toast('這台電腦沒有 winget，已開啟 Core Temp 官方下載頁。', 'warn');
      await window.api?.setupTools?.openCoreTempDownload?.();
    } else {
      toast(result?.error || 'Core Temp 安裝失敗，請改用官方下載頁。', 'error');
    }
    await loadTools();
    setInstallingCoreTemp(false);
  };

  const openCoreTempDownload = async () => {
    await window.api?.setupTools?.openCoreTempDownload?.();
  };

  const openVirusTotalJoin = async () => {
    await window.api?.setupTools?.openVirusTotalJoin?.();
  };

  const openVirusTotalApiKey = async () => {
    await window.api?.setupTools?.openVirusTotalApiKey?.();
  };

  const save = async (finish = false) => {
    setSaving(true);
    setError('');
    const payload = {
      ...(settings || {}),
      general: {
        ...general,
        firstRunCompleted: finish ? true : general.firstRunCompleted,
        lastSetupCheckAt: new Date().toISOString(),
      },
    };
    const result = await window.api.saveSettings(payload);
    if (result.ok) {
      setSettings(payload);
      if (window.api.restartMonitor) await window.api.restartMonitor();
      toast(finish ? '設定完成' : '設定已儲存', 'ok');
      if (finish && onNavigate) onNavigate('dashboard');
    } else {
      setError(result.error || '設定儲存失敗');
    }
    setSaving(false);
  };

  const summary = useMemo(
    () => [
      { label: 'Downloads', value: general.downloadsPath },
      { label: 'Screenshots', value: general.screenshotsPath },
      { label: '專案路徑', value: projectRoots.join(' / ') || '尚未設定' },
      {
        label: 'Core Temp',
        value: toolStatus?.coreTemp?.installed ? '已安裝' : '未安裝，可稍後設定',
      },
      {
        label: 'VirusTotal',
        value: toolStatus?.virusTotal?.hasApiKey ? '已設定 API key' : '尚未設定，可稍後設定',
      },
      { label: '監控', value: general.watchEnabled === false ? '停用' : '啟用' },
    ],
    [general, projectRoots, toolStatus],
  );

  if (!settings) {
    return (
      <div className="setup-page">
        <PageHeader title="首次設定" description="正在讀取設定。" />
        <SectionPanel>
          <div className="skeleton-row" />
        </SectionPanel>
      </div>
    );
  }

  const current = STEPS[step].key;
  const coreTempInstalled = toolStatus?.coreTemp?.installed === true;
  const hasVirusTotalKey = toolStatus?.virusTotal?.hasApiKey === true;

  return (
    <div className="setup-page">
      <PageHeader
        eyebrow="SETUP"
        title="首次設定"
        description="先設定必要路徑，再檢查選配工具。個人資料與 API key 只會存在這台電腦。"
        actions={
          <Button variant="ghost" onClick={() => onNavigate && onNavigate('dashboard')}>
            稍後再設定
          </Button>
        }
      />

      <div className="setup-steps">
        {STEPS.map((item, index) => (
          <button
            key={item.key}
            className={`step-pill ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
            onClick={() => setStep(index)}
          >
            <span>{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>

      {error ? (
        <InlineAlert tone="danger" title="設定錯誤">
          {error}
        </InlineAlert>
      ) : null}
      {setupStatus && !setupStatus.complete ? (
        <InlineAlert tone="warn" title="尚未完成必要設定">
          請至少設定 Downloads、Screenshots 與一個專案掃描路徑。選配工具可稍後再補。
        </InlineAlert>
      ) : null}

      {current === 'downloads' ? (
        <SectionPanel
          title="設定 Downloads"
          description="用來整理下載資料夾與建立自動化規則。"
        >
          <PathPickerRow
            label="Downloads 資料夾"
            description="可以使用系統偵測值，也可以選擇其他資料夾。"
            value={general.downloadsPath}
            placeholder="選擇 Downloads 資料夾"
            onChange={(value) => updateGeneral({ downloadsPath: value })}
            onDetect={detectDownloads}
            onPick={() =>
              pickFolder('選擇 Downloads 資料夾', (folderPath) =>
                updateGeneral({ downloadsPath: folderPath }),
              )
            }
          />
        </SectionPanel>
      ) : null}

      {current === 'screenshots' ? (
        <SectionPanel
          title="設定 Screenshots"
          description="用來整理截圖與偵測新的圖片檔。"
        >
          <PathPickerRow
            label="Screenshots 資料夾"
            value={general.screenshotsPath}
            placeholder="選擇 Screenshots 資料夾"
            onChange={(value) => updateGeneral({ screenshotsPath: value })}
            onPick={() =>
              pickFolder('選擇 Screenshots 資料夾', (folderPath) =>
                updateGeneral({ screenshotsPath: folderPath }),
              )
            }
          />
        </SectionPanel>
      ) : null}

      {current === 'projects' ? (
        <SectionPanel
          title="設定專案掃描路徑"
          description="Project Hub 會從這些資料夾尋找你的專案。"
          actions={
            <Button
              size="sm"
              onClick={() =>
                pickFolder('加入專案資料夾', (folderPath) =>
                  updateProjectHub({ scanRoots: upsertRoot(projectRoots, folderPath) }),
                )
              }
            >
              加入資料夾
            </Button>
          }
        >
          <div className="path-list">
            {projectRoots.map((root) => (
              <div className="path-list-row" key={root}>
                <span>{root}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    updateProjectHub({ scanRoots: projectRoots.filter((item) => item !== root) })
                  }
                >
                  移除
                </Button>
              </div>
            ))}
            {projectRoots.length === 0 ? (
              <InlineAlert tone="info">尚未加入專案資料夾。至少加入一個路徑會讓首頁更完整。</InlineAlert>
            ) : null}
          </div>
        </SectionPanel>
      ) : null}

      {current === 'tools' ? (
        <SectionPanel
          title="選配工具檢查"
          description="這些不是啟動 app 的必要條件，但能讓硬體監控與檔案信譽查詢更完整。"
          actions={
            <Button size="sm" variant="ghost" onClick={loadTools}>
              重新檢查
            </Button>
          }
        >
          <div className="setup-tool-grid">
            <ToolCheckCard
              title="Core Temp"
              status={coreTempInstalled ? 'ready' : 'warn'}
              description="用來提供每核心 CPU 溫度。未安裝時，系統監控仍會使用其他可用來源。"
              details={
                coreTempInstalled
                  ? toolStatus?.coreTemp?.path
                  : toolStatus?.coreTemp?.wingetAvailable
                    ? '可透過 winget 自動安裝。安裝過程可能跳出 Windows 權限提示。'
                    : '這台電腦沒有 winget，請改用官方下載頁手動安裝。'
              }
              primaryAction={
                coreTempInstalled
                  ? null
                  : {
                      label: toolStatus?.coreTemp?.wingetAvailable ? '安裝 Core Temp' : '開啟下載頁',
                      onClick: toolStatus?.coreTemp?.wingetAvailable
                        ? installCoreTemp
                        : openCoreTempDownload,
                    }
              }
              secondaryAction={
                coreTempInstalled ? null : { label: '官方網站', onClick: openCoreTempDownload }
              }
              busy={installingCoreTemp}
            />
            <ToolCheckCard
              title="VirusTotal"
              status={hasVirusTotalKey ? 'ready' : 'warn'}
              description="用來做檔案 SHA-256 信譽查詢。預設只送雜湊，不會上傳檔案內容。"
              details={
                hasVirusTotalKey
                  ? 'API key 已存在本機 userData 設定檔。'
                  : '需要註冊 VirusTotal Community 並把自己的 API key 貼到安全性中心。'
              }
              primaryAction={
                hasVirusTotalKey ? null : { label: '前往註冊', onClick: openVirusTotalJoin }
              }
              secondaryAction={
                hasVirusTotalKey ? null : { label: 'API key 頁', onClick: openVirusTotalApiKey }
              }
            />
          </div>
          {!hasVirusTotalKey ? (
            <InlineAlert tone="info" title="VirusTotal 設定位置">
              註冊後到安全性中心的「VirusTotal 檔案信譽」貼上 API key。Public
              版不會內建任何人的金鑰。
            </InlineAlert>
          ) : null}
        </SectionPanel>
      ) : null}

      {current === 'monitor' ? (
        <SectionPanel
          title="啟用資料夾監控"
          description="啟用後會觀察 Downloads 與 Screenshots，協助你整理新增檔案。"
        >
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={general.watchEnabled !== false}
              onChange={(event) => updateGeneral({ watchEnabled: event.target.checked })}
            />
            <span>啟用資料夾監控</span>
          </label>
        </SectionPanel>
      ) : null}

      {current === 'summary' ? (
        <SectionPanel title="完成設定" description="確認後就可以開始使用。選配工具可稍後再補。">
          <div className="summary-list">
            {summary.map((item) => (
              <div className="summary-row" key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.value || '尚未設定'}</span>
              </div>
            ))}
          </div>
          <div className="head-actions" style={{ marginTop: 16 }}>
            <StatusBadge tone="ok">乾淨 public 設定</StatusBadge>
            <StatusBadge tone="muted">個人資料只存在本機</StatusBadge>
          </div>
        </SectionPanel>
      ) : null}

      <div className="wizard-actions">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>
          上一步
        </Button>
        <Button onClick={() => save(false)} busy={saving}>
          儲存設定
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
          >
            下一步
          </Button>
        ) : (
          <Button variant="primary" onClick={() => save(true)} busy={saving}>
            完成設定
          </Button>
        )}
      </div>
    </div>
  );
}
