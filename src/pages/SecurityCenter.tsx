import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import DataTable from '../components/DataTable.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import SecurityCard from '../components/SecurityCard.tsx';
import TechBackground from '../components/TechBackground.jsx';
import { useToast } from '../components/Toast.jsx';

const UIButton = Button as React.ComponentType<any>;
const UIDataTable = DataTable as React.ComponentType<any>;
const UIPageHeader = PageHeader as React.ComponentType<any>;
const UISectionPanel = SectionPanel as React.ComponentType<any>;

type SignalStatus = 'normal' | 'warning' | 'unavailable';
type SignalCategory = 'critical' | 'integrity' | 'device';

type Signal = {
  id: string;
  title: string;
  category: SignalCategory;
  status: SignalStatus;
  value: string;
  detail: string;
  points: number;
  deduction: number;
  reason: string;
  recommendation: string;
  settings?: string;
};

const CATEGORY_META: Record<
  SignalCategory,
  { title: string; eyebrow: string; description: string }
> = {
  critical: {
    title: 'Critical Protection',
    eyebrow: 'PRIORITY',
    description: '惡意程式防護、威脅狀態與掃描新鮮度。',
  },
  integrity: {
    title: 'System Integrity',
    eyebrow: 'TRUST',
    description: '開機鏈、硬體信任根與核心隔離能力。',
  },
  device: {
    title: 'Device Protection',
    eyebrow: 'DEVICE',
    description: '網路邊界、防火牆與裝置資料保護。',
  },
};

function boolText(value: unknown) {
  if (value === true) return '已啟用';
  if (value === false) return '未啟用';
  return '狀態未知';
}

function ageDays(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function signalStatus(ok: boolean | null): SignalStatus {
  if (ok === true) return 'normal';
  if (ok === false) return 'warning';
  return 'unavailable';
}

function deductionFor(status: SignalStatus, points: number) {
  if (status === 'normal') return 0;
  if (status === 'unavailable') return Math.round(points * 0.35);
  return points;
}

function unavailableReason(id: string) {
  const common = '可能是權限不足、需要系統管理員權限、Windows Security API 暫時不可用，或目前裝置不支援此項目。';
  const byId: Record<string, string> = {
    signature: '無法讀取病毒碼時間。可能是 Defender 狀態 API 未回傳資料，或安全中心服務尚未完成初始化。',
    defender: '無法讀取 Defender 即時防護。可能需要系統管理員權限，或此裝置使用第三方防毒接管 Defender。',
    threats: '無法確認威脅清單。可能需要系統管理員權限，或 Defender 威脅 API 暫時不可用。',
    'scan-age': '無法讀取上次掃描時間。可能是從未執行掃描，或 Defender 歷史紀錄不可用。',
    tpm: '無法確認 TPM。可能是裝置不支援 TPM、TPM 未初始化，或硬體安全 API 不可用。',
    'secure-boot': '無法確認 Secure Boot。可能是 BIOS/UEFI 不支援，或目前不是 UEFI Secure Boot 模式。',
    'memory-integrity': '無法讀取記憶體完整性。可能需要系統管理員權限，或核心隔離功能不支援此裝置。',
    firewall: '無法讀取防火牆設定檔。可能是網路安全 API 不可用，或權限不足。',
    bitlocker: '無法讀取 BitLocker。可能是 Windows 版本不支援、磁碟未啟用加密，或需要管理員權限。',
  };
  return byId[id] || common;
}

function makeSignal(input: Omit<Signal, 'deduction' | 'reason'> & { reason?: string }): Signal {
  return {
    ...input,
    deduction: deductionFor(input.status, input.points),
    reason:
      input.reason ||
      (input.status === 'unavailable'
        ? unavailableReason(input.id)
        : input.status === 'warning'
          ? '目前狀態低於建議安全基準。'
          : '此項目目前符合建議安全基準。'),
  };
}

function buildSignals(status: any, threatCount: number): Signal[] {
  const defender = status?.Defender || {};
  const firewall = Array.isArray(status?.Firewall)
    ? status.Firewall
    : status?.Firewall
      ? [status.Firewall]
      : [];
  const bitlocker = Array.isArray(status?.BitLocker)
    ? status.BitLocker
    : status?.BitLocker
      ? [status.BitLocker]
      : [];
  const signatureAge = ageDays(defender.AntivirusSignatureLastUpdated);
  const quickScanAge = ageDays(defender.QuickScanEndTime || defender.FullScanEndTime);
  const firewallOk = firewall.length ? firewall.every((row: any) => row.Enabled === true) : null;
  const bitlockerOk = bitlocker.length
    ? bitlocker.some((row: any) => row.ProtectionStatus === 1 || row.ProtectionStatus === 'On')
    : null;

  return [
    makeSignal({
      id: 'signature',
      title: '病毒碼新鮮度',
      category: 'critical',
      status: signalStatus(signatureAge !== null ? signatureAge <= 3 : null),
      value: signatureAge === null ? '狀態未知' : `${signatureAge} 天前`,
      detail: defender.AntivirusSignatureVersion
        ? `版本 ${defender.AntivirusSignatureVersion}`
        : '建議保持每日更新。',
      points: 12,
      settings: 'windowsdefender:',
      recommendation: '執行病毒碼更新；若長期無法更新，檢查 Windows Update 與 Defender 服務。',
    }),
    makeSignal({
      id: 'defender',
      title: 'Defender 即時防護',
      category: 'critical',
      status: signalStatus(
        typeof defender.RealTimeProtectionEnabled === 'boolean'
          ? defender.RealTimeProtectionEnabled
          : null,
      ),
      value: boolText(defender.RealTimeProtectionEnabled),
      detail: defender.AMServiceEnabled === false ? 'Defender 服務未啟用。' : '即時掃描與雲端保護狀態。',
      points: 22,
      settings: 'windowsdefender:',
      recommendation: '開啟 Windows Security，確認即時防護、雲端保護與樣本提交設定。',
    }),
    makeSignal({
      id: 'threats',
      title: '作用中威脅',
      category: 'critical',
      status: signalStatus(Number.isFinite(threatCount) ? threatCount === 0 : null),
      value: `${threatCount || 0} 個`,
      detail: 'Defender 威脅與隔離區待處理項目。',
      points: 8,
      settings: 'windowsdefender:',
      recommendation: '檢視威脅清單，先移除高風險項目；不確定的隔離項目不要直接還原。',
    }),
    makeSignal({
      id: 'scan-age',
      title: '上次掃描',
      category: 'critical',
      status: signalStatus(quickScanAge !== null ? quickScanAge <= 7 : null),
      value: quickScanAge === null ? '無紀錄' : `${quickScanAge} 天前`,
      detail: '快速或完整掃描越新，安全態勢越可信。',
      points: 8,
      recommendation: '先執行快速掃描；若最近曾接觸可疑檔案，改執行完整掃描。',
    }),
    makeSignal({
      id: 'tpm',
      title: 'TPM',
      category: 'integrity',
      status: signalStatus(status?.Tpm?.TpmPresent === true && status?.Tpm?.TpmReady === true),
      value: status?.Tpm ? boolText(status.Tpm.TpmReady) : '狀態未知',
      detail: '裝置身分、磁碟加密與硬體信任根。',
      points: 8,
      recommendation: '在 BIOS/UEFI 啟用 TPM/fTPM；若裝置不支援，可將此項視為硬體限制。',
    }),
    makeSignal({
      id: 'secure-boot',
      title: 'Secure Boot',
      category: 'integrity',
      status: signalStatus(typeof status?.SecureBoot === 'boolean' ? status.SecureBoot : null),
      value: boolText(status?.SecureBoot),
      detail: '降低開機鏈遭竄改與 bootkit 風險。',
      points: 8,
      recommendation: '在 BIOS/UEFI 啟用 Secure Boot；變更前先確認磁碟與開機模式相容。',
    }),
    makeSignal({
      id: 'memory-integrity',
      title: '記憶體完整性',
      category: 'integrity',
      status: signalStatus(typeof status?.MemoryIntegrity === 'number' ? status.MemoryIntegrity === 1 : null),
      value: status?.MemoryIntegrity === 1 ? '已啟用' : '未啟用或未知',
      detail: '核心隔離可降低惡意驅動與核心層攻擊風險。',
      points: 8,
      settings: 'ms-settings:windowsdefender',
      recommendation: '開啟 Windows Security 的核心隔離；若被驅動阻擋，先更新或移除不相容驅動。',
    }),
    makeSignal({
      id: 'firewall',
      title: '防火牆',
      category: 'device',
      status: signalStatus(firewallOk),
      value: firewall.length
        ? `${firewall.filter((row: any) => row.Enabled).length}/${firewall.length} 啟用`
        : '狀態未知',
      detail: '網域、私人、公用三種網路設定檔。',
      points: 16,
      settings: 'ms-settings:windowsdefender-firewall',
      recommendation: '確認所有網路設定檔都啟用防火牆；公用網路應維持更嚴格的入站規則。',
    }),
    makeSignal({
      id: 'bitlocker',
      title: 'BitLocker',
      category: 'device',
      status: signalStatus(bitlockerOk),
      value: bitlocker.length
        ? `${bitlocker.filter((row: any) => row.ProtectionStatus === 1 || row.ProtectionStatus === 'On').length}/${bitlocker.length} 保護`
        : '狀態未知',
      detail: '保護裝置遺失、離線存取或硬碟拆卸時的資料。',
      points: 10,
      settings: 'ms-settings:deviceencryption',
      recommendation: '啟用裝置加密或 BitLocker；啟用前先備份復原金鑰。',
    }),
  ];
}

function scoreSignals(signals: Signal[]) {
  const lost = signals.reduce((sum, signal) => sum + signal.deduction, 0);
  return Math.max(0, Math.min(100, 100 - lost));
}

function scoreTone(score: number) {
  if (score >= 82) return 'ok';
  if (score >= 64) return 'warn';
  return 'danger';
}

function statusSummary(signals: Signal[]) {
  return {
    critical: signals.filter((signal) => signal.category === 'critical' && signal.status !== 'normal').length,
    warning: signals.filter((signal) => signal.status === 'warning').length,
    unknown: signals.filter((signal) => signal.status === 'unavailable').length,
    normal: signals.filter((signal) => signal.status === 'normal').length,
  };
}

function normalizeQuarantineOutput(lines: unknown[]) {
  const raw = (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || '').trim())
    .filter(Boolean);
  const joined = raw.join('\n').toLowerCase();
  const needsAdmin =
    joined.includes('administrator privilege') ||
    joined.includes('0x80070005') ||
    joined.includes('access is denied') ||
    joined.includes('failed with hr');

  if (needsAdmin) {
    return {
      tone: 'warn' as const,
      title: '需要系統管理員權限才能讀取隔離區',
      body:
        'Defender 隔離區清單需要提高權限。請以系統管理員執行應用程式，或從 Windows Security 開啟「防護歷程記錄」查看。',
      details: raw.filter((line) => !line.includes('�?') && !line.includes('���')).slice(0, 4),
    };
  }

  if (!raw.length) return null;

  return {
    tone: 'info' as const,
    title: '隔離區輸出',
    body: 'Defender 回傳以下隔離區資訊。',
    details: raw,
  };
}

export default function SecurityCenter() {
  const { toast } = useToast() as { toast: (message: string, type?: string) => void };
  const [status, setStatus] = useState<any>(null);
  const [threats, setThreats] = useState<any>({ threats: [], detections: [], quarantine: [] });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['defender']));
  const [scanProgress, setScanProgress] = useState<any>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [scanElapsedMs, setScanElapsedMs] = useState(0);
  const [customPath, setCustomPath] = useState('');
  const [hashOrPath, setHashOrPath] = useState('');
  const [reputation, setReputation] = useState<any>(null);
  const [vtKey, setVtKey] = useState('');
  const [settings, setSettings] = useState<any>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [securityResult, threatResult, settingsResult] = await Promise.all([
      window.api?.security?.getStatus?.(),
      window.api?.antivirus?.listThreats?.(),
      window.api?.antivirus?.getSettings?.(),
    ]);
    if (securityResult?.ok) setStatus(securityResult.status);
    else {
      const message = securityResult?.error || '安全狀態讀取失敗。';
      setLoadError(message);
      toast(message, 'error');
    }
    if (threatResult?.ok) setThreats(threatResult);
    if (settingsResult?.ok) setSettings(settingsResult.settings);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const offProgress = window.api?.antivirus?.onScanProgress?.((progress: any) =>
      setScanProgress(progress),
    );
    const offResult = window.api?.antivirus?.onScanResult?.((result: any) => {
      setScanResult(result);
      setScanRunning(false);
      setScanElapsedMs(Number(result?.elapsed || 0));
      refresh();
    });
    return () => {
      offProgress?.();
      offResult?.();
    };
  }, [refresh]);

  useEffect(() => {
    if (!scanRunning || !scanStartedAt) return undefined;
    const tick = () => setScanElapsedMs(Date.now() - scanStartedAt);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [scanRunning, scanStartedAt]);

  const threatCount =
    (threats?.threats?.filter((row: any) => row.IsActive !== false).length || 0) +
    (threats?.quarantine?.length || 0);
  const signals = useMemo(() => (status ? buildSignals(status, threatCount) : []), [status, threatCount]);
  const score = useMemo(() => scoreSignals(signals), [signals]);
  const summary = statusSummary(signals);
  const recommendations = signals
    .filter((signal) => signal.deduction > 0)
    .sort((a, b) => b.deduction - a.deduction);
  const quarantineInfo = normalizeQuarantineOutput(threats?.quarantine || []);

  const toggleCard = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startScan = async (type: string) => {
    if (type === 'custom' && !customPath.trim()) {
      toast('請先輸入或選擇要掃描的路徑', 'warn');
      return;
    }
    setScanResult(null);
    const startedAt = Date.now();
    setScanStartedAt(startedAt);
    setScanElapsedMs(0);
    setScanRunning(true);
    setScanProgress({
      type,
      phase: 'Starting Defender scan',
      elapsed: 0,
      line: 'Defender scan is starting...',
      threats: 0,
    });
    const result = await window.api?.antivirus?.startScan?.({
      type,
      path: type === 'custom' ? customPath.trim() : undefined,
    });
    setScanRunning(false);
    if (result && !result.ok && !result.cancelled) toast(result.error || '掃描啟動失敗', 'error');
    if (result) {
      setScanElapsedMs(Number(result.elapsed || Date.now() - startedAt));
      setScanResult(result);
    }
  };

  const cancelScan = async () => {
    const result = await window.api?.antivirus?.cancelScan?.();
    if (result?.ok) {
      setScanRunning(false);
      setScanResult({ ok: false, cancelled: true, summary: '掃描已取消' });
    }
  };

  const pickCustomScanPath = async (type: 'file' | 'folder') => {
    const result = await window.api?.pickPath?.({
      type,
      title: type === 'folder' ? '選擇要掃描的資料夾' : '選擇要掃描的檔案',
    });
    if (result?.ok && result.path) {
      setCustomPath(result.path);
    }
  };

  const pickReputationFile = async () => {
    const result = await window.api?.pickPath?.({
      type: 'file',
      title: '選擇要查詢信譽的檔案',
    });
    if (result?.ok && result.path) {
      setHashOrPath(result.path);
    }
  };

  const saveVirusTotal = async () => {
    const result = await window.api?.antivirus?.saveSettings?.({
      virusTotalApiKey: vtKey,
      allowFileUpload: settings?.allowFileUpload === true,
    });
    if (result?.ok) {
      setSettings(result.settings);
      setVtKey('');
      toast('VirusTotal 設定已儲存', 'ok');
    }
  };

  const clearVirusTotal = async () => {
    const result = await window.api?.antivirus?.saveSettings?.({ clearVirusTotalKey: true });
    if (result?.ok) {
      setSettings(result.settings);
      toast('VirusTotal 金鑰已清除', 'ok');
    }
  };

  const checkReputation = async () => {
    if (!hashOrPath.trim()) return;
    const result = await window.api?.antivirus?.checkReputation?.(hashOrPath.trim());
    setReputation(result);
  };

  const openSettings = (url?: string) => {
    if (url) window.api?.openExternal?.(url);
  };

  const scanDisplayElapsed = scanRunning
    ? scanElapsedMs
    : Number(scanResult?.elapsed || scanProgress?.elapsed || scanElapsedMs || 0);
  const scanDisplayLine = scanRunning
    ? scanProgress?.line || 'Defender scan is running...'
    : scanResult?.summary || scanProgress?.line || '掃描已結束';
  const scanDisplayPhase = scanRunning ? scanProgress?.phase || 'Scanning' : 'Scan finished';

  return (
    <div className="security-page security-dashboard tech-surface">
      <TechBackground />
      <UIPageHeader
        eyebrow="SECURITY"
        title="安全性中心"
        description="整合 Windows Defender 態勢、主動掃毒、威脅處置與檔案信譽查詢。"
        actions={
          <>
            <UIButton variant="ghost" onClick={() => window.api?.security?.updateSignatures?.()}>
              更新病毒碼
            </UIButton>
            <UIButton variant="primary" busy={loading} onClick={refresh}>
              重新整理
            </UIButton>
          </>
        }
      />

      {loadError ? (
        <InlineAlert tone="danger" title="Windows Security 資料讀取失敗">
          {loadError} 可能需要系統管理員權限，或 Windows Security API 暫時不可用。
        </InlineAlert>
      ) : null}

      {loading && !signals.length ? (
        <div className="security-empty-state">
          <strong>正在讀取 Windows Security 狀態</strong>
          <span>正在查詢 Defender、防火牆、TPM、Secure Boot 與 BitLocker。</span>
        </div>
      ) : null}

      {!loading && !loadError && !signals.length ? (
        <div className="security-empty-state">
          <strong>尚無安全資料</strong>
          <span>Windows Security 尚未回傳可用資料。你可以重試或開啟 Windows Security 檢查系統狀態。</span>
          <div>
            <UIButton size="sm" onClick={refresh}>Retry</UIButton>
            <UIButton size="sm" variant="ghost" onClick={() => openSettings('windowsdefender:')}>
              開啟設定
            </UIButton>
          </div>
        </div>
      ) : null}

      {signals.length ? (
        <>
          <section className="security-hero">
            <div
              className={`security-score-ring ${scoreTone(score)}`}
              style={{ '--score': `${score * 3.6}deg` } as React.CSSProperties}
            >
              <div>
                <strong>{score}</strong>
                <span>/ 100</span>
              </div>
            </div>
            <div className="security-hero-copy">
              <span>Security Posture</span>
              <h2>{score >= 82 ? '防護狀態良好' : score >= 64 ? '有幾項需要注意' : '建議立即處理'}</h2>
              <p>分數依實際顯示扣分計算：Warning 扣完整權重，Unknown 僅扣部分權重並標示可能原因。</p>
            </div>
            <div className="security-summary-strip">
              <div className="critical">
                <span>Critical Issues</span>
                <strong>{summary.critical}</strong>
              </div>
              <div className="warning">
                <span>Warnings</span>
                <strong>{summary.warning}</strong>
              </div>
              <div className="unknown">
                <span>Unknown</span>
                <strong>{summary.unknown}</strong>
              </div>
              <div className="normal">
                <span>Normal</span>
                <strong>{summary.normal}</strong>
              </div>
            </div>
          </section>

          <UISectionPanel title="建議採取的動作">
            {recommendations.length ? (
              <div className="recommendation-list">
                {recommendations.map((item) => (
                  <div
                    role="button"
                    tabIndex={0}
                    className={`recommendation-row ${item.status}`}
                    key={item.id}
                    onClick={() => toggleCard(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleCard(item.id);
                      }
                    }}
                  >
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.recommendation}</span>
                    </div>
                    <StatusBadge tone={item.status === 'warning' ? 'warn' : 'danger'}>
                      -{item.deduction}
                    </StatusBadge>
                    {item.settings ? (
                      <UIButton
                        size="sm"
                        variant="ghost"
                        onClick={(event: React.MouseEvent) => {
                          event.stopPropagation();
                          openSettings(item.settings);
                        }}
                      >
                        開啟設定
                      </UIButton>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <InlineAlert tone="ok" title="目前沒有優先警示">
                主要安全訊號都在正常範圍。
              </InlineAlert>
            )}
          </UISectionPanel>

          {(Object.keys(CATEGORY_META) as SignalCategory[]).map((category) => {
            const meta = CATEGORY_META[category];
            const group = signals.filter((signal) => signal.category === category);
            if (!group.length) return null;
            return (
              <UISectionPanel
                key={category}
                eyebrow={meta.eyebrow}
                title={meta.title}
                description={meta.description}
                className="security-signal-section"
              >
                <div className="security-card-grid">
                  {group.map((signal) => (
                    <SecurityCard
                      key={signal.id}
                      title={signal.title}
                      status={signal.status}
                      value={signal.value}
                      detail={signal.detail}
                      reason={signal.reason}
                      recommendation={signal.recommendation}
                      deduction={signal.deduction}
                      expanded={expanded.has(signal.id)}
                      onToggle={() => toggleCard(signal.id)}
                      action={
                        signal.settings ? (
                          <UIButton size="sm" variant="ghost" onClick={() => openSettings(signal.settings)}>
                            開啟設定
                          </UIButton>
                        ) : (
                          <UIButton size="sm" variant="ghost" onClick={refresh}>
                            Retry
                          </UIButton>
                        )
                      }
                    />
                  ))}
                </div>
              </UISectionPanel>
            );
          })}
        </>
      ) : null}

      <UISectionPanel title="病毒掃描" description="Defender 不提供可靠百分比；進度以階段、經過時間與輸出活動呈現。">
        <div className="antivirus-panel">
          <div className="scan-button-row">
            <UIButton onClick={() => startScan('quick')}>快速掃描</UIButton>
            <UIButton variant="ghost" onClick={() => startScan('full')}>
              完整掃描
            </UIButton>
            <UIButton variant="danger" onClick={() => startScan('offline')}>
              Defender 離線掃描
            </UIButton>
            <UIButton variant="ghost" onClick={cancelScan}>
              取消
            </UIButton>
          </div>
          <div className="custom-scan-row">
            <input
              value={customPath}
              onChange={(event) => setCustomPath(event.target.value)}
              placeholder="輸入要掃描的檔案或資料夾路徑"
            />
            <UIButton variant="ghost" onClick={() => pickCustomScanPath('file')}>
              選檔案
            </UIButton>
            <UIButton variant="ghost" onClick={() => pickCustomScanPath('folder')}>
              選資料夾
            </UIButton>
            <UIButton onClick={() => startScan('custom')}>自訂路徑掃描</UIButton>
          </div>
          {scanProgress ? (
            <div className="scan-live">
              <strong>{scanDisplayPhase}</strong>
              <span>{Math.round(scanDisplayElapsed / 1000)} 秒</span>
              <div className="tech-progress-track">
                <div
                  className={`tech-progress-bar ${scanRunning ? 'indeterminate' : ''}`}
                  style={{ '--progress': scanRunning ? '38%' : '100%' } as React.CSSProperties}
                />
              </div>
              <code>{scanDisplayLine}</code>
            </div>
          ) : null}
          {scanResult ? (
            <InlineAlert tone={scanResult.threats > 0 ? 'danger' : scanResult.ok ? 'ok' : 'warn'} title="掃描結果">
              {scanResult.summary || scanResult.error || '掃描已結束'}
            </InlineAlert>
          ) : null}
        </div>
      </UISectionPanel>

      <UISectionPanel title="威脅與隔離區">
        <UIDataTable
          rows={[...(threats?.threats || []), ...(threats?.detections || [])]}
          emptyIcon="OK"
          emptyTitle="目前沒有 Defender 威脅紀錄"
          emptyDescription="沒有偵測到作用中威脅或歷史威脅項目。"
          columns={[
            { key: 'ThreatName', label: '名稱', render: (row: any) => row.ThreatName || row.ThreatID || '--' },
            { key: 'SeverityID', label: '嚴重度', render: (row: any) => row.SeverityID || '--' },
            { key: 'ThreatStatusID', label: '狀態', render: (row: any) => row.ThreatStatusID || (row.IsActive ? 'Active' : '--') },
            { key: 'Resources', label: '路徑', className: 'path', render: (row: any) => String(row.Resources || '--') },
            {
              key: 'actions',
              label: '動作',
              render: (row: any) => (
                <div className="threat-actions">
                  <UIButton size="sm" variant="danger" onClick={() => window.api?.antivirus?.removeThreat?.(row)}>
                    移除
                  </UIButton>
                  <UIButton size="sm" variant="ghost" onClick={() => window.api?.antivirus?.restoreThreat?.({ name: row.ThreatName })}>
                    還原
                  </UIButton>
                </div>
              ),
            },
          ]}
        />
        {quarantineInfo ? (
          <div className="quarantine-list">
            <InlineAlert tone={quarantineInfo.tone} title={quarantineInfo.title}>
              {quarantineInfo.body}
            </InlineAlert>
            {quarantineInfo.details.length ? (
              <div className="quarantine-details">
                {quarantineInfo.details.map((line: string, index: number) => (
                  <code key={String(line) + '-' + index}>{line}</code>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </UISectionPanel>

      <UISectionPanel title="VirusTotal 檔案信譽">
        <div className="vt-settings">
          <div>
            <strong>{settings?.hasVirusTotalKey ? 'VirusTotal 已啟用' : '尚未設定 VirusTotal 金鑰'}</strong>
            <span>預設只送 SHA-256 雜湊；上傳檔案需明確 opt-in。</span>
          </div>
          <input
            value={vtKey}
            onChange={(event) => setVtKey(event.target.value)}
            placeholder="貼上 VirusTotal API key 以更新"
          />
          <UIButton onClick={saveVirusTotal}>儲存金鑰</UIButton>
          <UIButton variant="ghost" onClick={clearVirusTotal}>清除</UIButton>
        </div>
        <div className="custom-scan-row">
          <input
            value={hashOrPath}
            onChange={(event) => setHashOrPath(event.target.value)}
            placeholder="輸入檔案路徑或 SHA-256"
          />
          <UIButton variant="ghost" onClick={pickReputationFile}>
            選檔案
          </UIButton>
          <UIButton onClick={checkReputation}>查詢信譽</UIButton>
        </div>
        {reputation ? (
          <InlineAlert tone={reputation.ok ? (reputation.verdict === 'clean' ? 'ok' : 'danger') : 'warn'} title="VirusTotal 結果">
            {reputation.ok
              ? '判定 ' + reputation.verdict + '; malicious ' + (reputation.stats?.malicious || 0) + ', suspicious ' + (reputation.stats?.suspicious || 0)
              : reputation.error}
          </InlineAlert>
        ) : null}
      </UISectionPanel>
    </div>
  );
}
