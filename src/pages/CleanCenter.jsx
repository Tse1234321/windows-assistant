import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/Button.jsx';
import DataTable from '../components/DataTable.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import TechBackground from '../components/TechBackground.jsx';
import { useToast } from '../components/Toast.jsx';
import CategoryCards from '../components/cleanup/CategoryCards.jsx';
import CleanConfirmPopover from '../components/cleanup/CleanConfirmPopover.jsx';
import DuplicateGroups from '../components/cleanup/DuplicateGroups.jsx';
import FileDetailTable from '../components/cleanup/FileDetailTable.jsx';
import IgnoreListManager from '../components/cleanup/IgnoreListManager.jsx';
import RecommendationsPanel from '../components/cleanup/RecommendationsPanel.jsx';
import RecycleBinCard from '../components/cleanup/RecycleBinCard.jsx';
import SmartCleanHero from '../components/cleanup/SmartCleanHero.jsx';
import StartupPanel from '../components/cleanup/StartupPanel.jsx';
import {
  CLEANABLE_CATEGORIES,
  RISK_REVIEW,
  RISK_SAFE,
  categoryInfo,
  categoryRows,
  formatBytes,
  formatTime,
  normalizeRisk,
  parentFolder,
} from '../components/cleanup/cleanupShared.js';
import '../styles/clean-center.css';

const TABS = [
  { key: 'categories', label: '分類總覽', icon: '▦' },
  { key: 'files', label: '檔案明細', icon: '≣' },
  { key: 'duplicates', label: '重複檔案', icon: '⧉' },
  { key: 'system', label: '系統項目', icon: '♻' },
  { key: 'ignore', label: '忽略清單', icon: '⊘' },
  { key: 'logs', label: '清理紀錄', icon: '≡' },
];

function recomputeSummary(items) {
  return {
    totalCount: items.length,
    totalSize: items.reduce((sum, item) => sum + Number(item.size || 0), 0),
    safeCount: items.filter((item) => normalizeRisk(item.risk) === RISK_SAFE).length,
    selectedDefaultSize: items
      .filter((item) => item.selectedDefault)
      .reduce((sum, item) => sum + Number(item.size || 0), 0),
  };
}

export default function CleanCenter({ onNavigate = () => {} }) {
  const { toast } = useToast();
  const [scanResult, setScanResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmMode, setConfirmMode] = useState(null); // null | 'quick' | 'advanced'
  const [confirmAnchor, setConfirmAnchor] = useState(''); // 'files' | 'duplicates'
  const [activeInfo, setActiveInfo] = useState(null);
  const [report, setReport] = useState(null);
  const [scanProgress, setScanProgress] = useState(null);
  const [cleanProgress, setCleanProgress] = useState(null);
  const [cleaningPhase, setCleaningPhase] = useState(null); // null | 'cleaning' | 'rescan'
  const [diskUsage, setDiskUsage] = useState(null);
  const [fileSecurity, setFileSecurity] = useState({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('categories');
  const [includedCategories, setIncludedCategories] = useState(new Set(CLEANABLE_CATEGORIES));
  const [ignoreList, setIgnoreList] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const advancedConfirmAnchorRef = useRef(null);

  const load = useCallback(async () => {
    if (!window.api?.cleanup) return;
    const logsResult = await window.api.cleanup.getLogs().catch(() => null);
    if (logsResult?.ok) setLogs(logsResult.logs || []);
    const diskResult = await window.api.cleanup.getDiskUsage?.('C:\\').catch(() => null);
    if (diskResult?.ok) setDiskUsage(diskResult);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!window.api?.cleanup?.onScanProgress) return undefined;
    return window.api.cleanup.onScanProgress((progress) => setScanProgress(progress));
  }, []);

  useEffect(() => {
    if (!window.api?.cleanup?.onCleanProgress) return undefined;
    return window.api.cleanup.onCleanProgress((progress) => setCleanProgress(progress));
  }, []);

  const applyScanResult = useCallback((result) => {
    setScanResult(result);
    setSelected(
      new Set((result.items || []).filter((item) => item.selectedDefault).map((item) => item.id)),
    );
    setIgnoreList(result.ignoreList || []);
    setIncludedCategories(new Set(CLEANABLE_CATEGORIES));
  }, []);

  const runScan = async () => {
    setBusy(true);
    setReport(null);
    setCleanProgress(null);
    setScanProgress({ phase: 'Preparing scan', scanned: 0, total: 1 });
    const result = await window.api.cleanup.scan({});
    setBusy(false);
    setScanProgress(null);
    if (!result.ok) {
      toast(result.error || '掃描失敗', 'error');
      return;
    }
    applyScanResult(result);
    toast(`掃描完成：找到 ${result.summary.totalCount} 個項目`, 'ok');
    load();
  };

  const items = useMemo(() => scanResult?.items || [], [scanResult?.items]);
  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );
  const safeSelectedItems = useMemo(
    () => selectedItems.filter((item) => normalizeRisk(item.risk) === RISK_SAFE),
    [selectedItems],
  );
  const oneClickItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.selectedDefault &&
          normalizeRisk(item.risk) === RISK_SAFE &&
          includedCategories.has(item.category),
      ),
    [items, includedCategories],
  );
  const selectedSize = selectedItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const oneClickSize = oneClickItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const selectedNeedsReview = selectedItems.filter(
    (item) => normalizeRisk(item.risk) !== RISK_SAFE,
  ).length;

  const safeCount = items.filter((item) => normalizeRisk(item.risk) === RISK_SAFE).length;
  const reviewCount = items.filter((item) => normalizeRisk(item.risk) === RISK_REVIEW).length;
  const dangerCount = Math.max(0, items.length - safeCount - reviewCount);

  const toggleItem = (item) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const toggleCategory = (name) => {
    setIncludedCategories((prev) => {
      const next = new Set(prev);
      const removing = next.has(name);
      if (removing) next.delete(name);
      else next.add(name);
      setSelected((prevSelected) => {
        const nextSelected = new Set(prevSelected);
        for (const item of items) {
          if (item.category !== name) continue;
          if (removing) nextSelected.delete(item.id);
          else if (item.selectedDefault) nextSelected.add(item.id);
        }
        return nextSelected;
      });
      return next;
    });
  };

  const rescanAfterClean = async (wasQuickClean, cleanedPaths) => {
    const prev = scanResult;
    const settings = wasQuickClean ? { scanDuplicateFiles: false } : undefined;
    const refreshed = await window.api.cleanup.scan(settings ? { settings } : {});
    if (!refreshed.ok) return;
    if (wasQuickClean && prev) {
      // Quick clean never touches duplicate candidates (they live in user folders and are
      // never selectedDefault), so carry the previous duplicate data over the fast rescan.
      const cleaned = new Set((cleanedPaths || []).map((p) => String(p).toLowerCase()));
      const prevDupItems = (prev.items || []).filter(
        (item) =>
          item.category === 'Duplicate Files' && !cleaned.has(String(item.path).toLowerCase()),
      );
      refreshed.items = [...(refreshed.items || []), ...prevDupItems];
      refreshed.duplicateGroups = prev.duplicateGroups || [];
      if (prev.categories?.['Duplicate Files']) {
        refreshed.categories = {
          ...refreshed.categories,
          'Duplicate Files': prev.categories['Duplicate Files'],
        };
      }
      refreshed.summary = { ...refreshed.summary, ...recomputeSummary(refreshed.items) };
    }
    applyScanResult(refreshed);
  };

  const cleanItems = async (itemsToClean, { quick = false } = {}) => {
    setConfirmMode(null);
    if (!itemsToClean.length) {
      toast('沒有可清理的項目', 'warn');
      return;
    }
    setBusy(true);
    setCleaningPhase('cleaning');
    setCleanProgress({ phase: 'Cleaning', done: 0, total: itemsToClean.length, freedSize: 0 });
    const result = await window.api.cleanup.cleanSelected({ items: itemsToClean });
    setReport(result);
    setSelected(new Set());
    toast(
      `清理完成：成功 ${result.cleaned || 0}，跳過 ${result.skipped || 0}，失敗 ${result.failed || 0}，釋放 ${formatBytes(result.freedSize)}`,
      result.failed ? 'warn' : 'ok',
    );
    setCleaningPhase('rescan');
    await load();
    const cleanedPaths = (result.results || [])
      .filter((row) => row.status === 'cleaned')
      .map((row) => row.path);
    await rescanAfterClean(quick, cleanedPaths);
    setCleaningPhase(null);
    setCleanProgress(null);
    setBusy(false);
  };

  const scanFileNow = async (row) => {
    if (!window.api?.antivirus?.startScan) {
      toast('掃毒服務尚未啟用', 'warn');
      return;
    }
    setFileSecurity((prev) => ({
      ...prev,
      [row.id]: { ...(prev[row.id] || {}), scan: '掃描中' },
    }));
    const result = await window.api.antivirus.startScan({ type: 'custom', path: row.path });
    setFileSecurity((prev) => ({
      ...prev,
      [row.id]: {
        ...(prev[row.id] || {}),
        scan: result?.ok
          ? result.threats > 0
            ? `發現 ${result.threats} 個威脅`
            : '未發現威脅'
          : result?.error || '掃描失敗',
      },
    }));
  };

  const checkReputation = async (row) => {
    if (!window.api?.antivirus?.checkReputation) {
      toast('VirusTotal 查詢尚未啟用', 'warn');
      return;
    }
    setFileSecurity((prev) => ({
      ...prev,
      [row.id]: { ...(prev[row.id] || {}), reputation: '查詢中' },
    }));
    const result = await window.api.antivirus.checkReputation(row.path);
    const stats = result?.stats || {};
    setFileSecurity((prev) => ({
      ...prev,
      [row.id]: {
        ...(prev[row.id] || {}),
        reputation: result?.ok
          ? `VT 惡意 ${stats.malicious || 0} / 可疑 ${stats.suspicious || 0}`
          : result?.error || 'VT 未啟用',
      },
    }));
  };

  const openPath = (targetPath) => {
    if (targetPath) window.api.cleanup.openPath(targetPath);
  };

  const addIgnore = async (item) => {
    const result = await window.api.cleanup.addIgnoreItem(item);
    if (!result?.ok) {
      toast(result?.error || '新增忽略規則失敗', 'error');
      return false;
    }
    setIgnoreList(result.items || []);
    toast('已加入忽略清單，下次掃描生效', 'ok');
    return true;
  };

  const removeIgnore = async (id) => {
    const result = await window.api.cleanup.removeIgnoreItem(id);
    if (!result?.ok) {
      toast(result?.error || '移除忽略規則失敗', 'error');
      return;
    }
    setIgnoreList(result.items || []);
    toast('已移除忽略規則', 'ok');
  };

  const emptyRecycleBin = async () => {
    setBusy(true);
    const result = await window.api.cleanup.emptyRecycleBin();
    setBusy(false);
    toast(
      result?.ok ? `已清空資源回收筒，釋放 ${formatBytes(result.clearedSize)}` : result?.error || '清空失敗',
      result?.ok ? 'ok' : 'error',
    );
    await refreshRecycleBin();
    load();
  };

  const refreshRecycleBin = async () => {
    const result = await window.api.cleanup.getRecycleBin?.().catch(() => null);
    if (result?.ok) {
      setScanResult((prev) => (prev ? { ...prev, recycleBin: result } : prev));
    }
  };

  const refreshStartupItems = async () => {
    const result = await window.api.cleanup.getStartupItems?.().catch(() => null);
    if (result?.ok) {
      setScanResult((prev) => (prev ? { ...prev, startup: result } : prev));
    }
    return result;
  };

  const toggleStartupMark = async (item) => {
    const settings = scanResult?.settings;
    if (!settings) return;
    const current = Array.isArray(settings.disabledStartupItems)
      ? settings.disabledStartupItems
      : [];
    const key = String(item.path || '').toLowerCase();
    const has = current.some((p) => String(p).toLowerCase() === key);
    const nextList = has
      ? current.filter((p) => String(p).toLowerCase() !== key)
      : [...current, item.path];
    const next = { ...settings, disabledStartupItems: nextList };
    const saved = await window.api.cleanup.saveSettings(next);
    if (!saved?.ok) {
      toast(saved?.error || '儲存設定失敗', 'error');
      return;
    }
    setScanResult((prev) => (prev ? { ...prev, settings: saved.settings || next } : prev));
    await refreshStartupItems();
    toast(has ? '已取消停用標記' : '已標記停用', 'ok');
  };

  const keepNewest = (groupItems) => {
    if (groupItems.length < 2) return;
    const sorted = [...groupItems].sort(
      (a, b) => new Date(b.mtime || 0).getTime() - new Date(a.mtime || 0).getTime(),
    );
    const [newest, ...rest] = sorted;
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(newest.id);
      rest.forEach((item) => next.add(item.id));
      return next;
    });
    toast(`已勾選 ${rest.length} 個較舊副本，保留最新的 ${newest.fileName}`, 'ok');
  };

  const handleRecommendation = (target) => {
    if (target === 'scan' || target === 'scan-temp') {
      runScan();
      return;
    }
    if (target === 'downloads') {
      onNavigate('downloads');
      return;
    }
    if (target === 'projects') {
      onNavigate('projects');
      return;
    }
    setAdvancedOpen(true);
    if (target === 'large') {
      setActiveTab('files');
      setCategoryFilter('Large Files');
    } else if (target === 'duplicates') {
      setActiveTab('duplicates');
    } else if (target === 'recycle' || target === 'startup') {
      setActiveTab('system');
    } else {
      setActiveTab('categories');
    }
  };

  const exportLogs = async () => {
    const result = await window.api.cleanup.exportLogs('json');
    toast(
      result.ok ? `已匯出清理紀錄：${result.path}` : result.error || '匯出失敗',
      result.ok ? 'ok' : 'error',
    );
  };

  const renderAdvancedCleanButton = (anchorKey) => (
    <span className="cc-confirm-anchor" ref={advancedConfirmAnchorRef}>
      <Button
        variant="danger"
        disabled={selectedItems.length === 0 || busy}
        onClick={() => {
          setConfirmAnchor(anchorKey);
          setConfirmMode((prev) =>
            prev === 'advanced' && confirmAnchor === anchorKey ? null : 'advanced',
          );
        }}
      >
        清理已選項目
      </Button>
      <CleanConfirmPopover
        open={confirmMode === 'advanced' && confirmAnchor === anchorKey}
        anchorRef={advancedConfirmAnchorRef}
        placement="left"
        title="確認清理已選項目"
        count={selectedItems.length}
        size={selectedSize}
        note={
          selectedNeedsReview
            ? `包含 ${selectedNeedsReview} 個非「安全清理」項目，建議先確認來源路徑。使用中或被鎖定的檔案會自動跳過。`
            : '項目會移到資源回收筒；使用中或被鎖定的檔案會自動跳過。'
        }
        busy={busy}
        onCancel={() => setConfirmMode(null)}
        actions={[
          {
            label: `只清理安全項目 (${safeSelectedItems.length})`,
            variant: 'primary',
            disabled: !safeSelectedItems.length,
            onClick: () => cleanItems(safeSelectedItems),
          },
          {
            label: '全部清理',
            variant: 'danger',
            onClick: () => cleanItems(selectedItems),
          },
        ]}
      />
    </span>
  );

  const summary = scanResult?.summary || {};
  const rows = categoryRows(scanResult?.categories);
  const reportReasons = report?.report?.failureReasons || [];
  const duplicateGroups = scanResult?.duplicateGroups || [];
  const recycleBin = scanResult?.recycleBin || null;
  const startup = scanResult?.startup || null;
  const recommendations = scanResult?.optimization?.recommendations || [];
  const hasScanned = !!scanResult;

  const tabBadges = {
    categories: rows.filter((row) => row.count > 0).length || '',
    files: items.length || '',
    duplicates: duplicateGroups.length ? `${duplicateGroups.length} 組` : '',
    system: recycleBin?.count ? formatBytes(recycleBin.size) : '',
    ignore: ignoreList.length || '',
    logs: logs.length || '',
  };

  return (
    <div className="ee-tech cc-page cleanup-page">
      <TechBackground />
      <div className="ee-hero">
        <span className="ee-kicker">Organize</span>
        <h1 className="ee-title">Clean Center</h1>
        <p className="ee-sub">
          以保守規則掃描與清理磁碟空間：只移到資源回收筒、避開系統與使用者重要資料，清理前後都有完整報告。
        </p>
      </div>

      <SmartCleanHero
        hasScanned={hasScanned}
        busy={busy}
        scanProgress={busy ? scanProgress : null}
        cleanProgress={cleanProgress}
        diskUsage={diskUsage}
        safeCount={safeCount}
        reviewCount={reviewCount}
        dangerCount={dangerCount}
        oneClickCount={oneClickItems.length}
        oneClickSize={oneClickSize}
        onScan={runScan}
        onOneClickClean={() => setConfirmMode((prev) => (prev === 'quick' ? null : 'quick'))}
        confirmOpen={confirmMode === 'quick'}
        onConfirmStart={() => cleanItems(oneClickItems, { quick: true })}
        onConfirmCancel={() => setConfirmMode(null)}
        advancedOpen={advancedOpen}
        onToggleAdvanced={() => setAdvancedOpen((prev) => !prev)}
      />

      {report ? (
        <SectionPanel
          title="清理完成報告"
          description="每次清理都會留下摘要與詳細結果，方便追蹤發生了什麼。"
        >
          <div className="cleanup-report-grid">
            <div>
              <span>成功刪除</span>
              <strong>{report.cleaned || report.report?.successCount || 0}</strong>
            </div>
            <div>
              <span>釋放容量</span>
              <strong>{formatBytes(report.freedSize || report.report?.freedSize)}</strong>
            </div>
            <div>
              <span>跳過數量</span>
              <strong>{report.skipped || report.report?.skippedCount || 0}</strong>
            </div>
            <div>
              <span>失敗數量</span>
              <strong>{report.failed || report.report?.failureCount || 0}</strong>
            </div>
          </div>
          {reportReasons.length ? (
            <div className="cleanup-reason-list">
              <h3>跳過 / 失敗原因</h3>
              {reportReasons.slice(0, 20).map((row, index) => (
                <div className="cleanup-reason-row" key={`${row.path}-${index}`}>
                  <strong>{row.fileName || row.path}</strong>
                  <span>
                    {row.status === 'skipped' ? '跳過' : '失敗'}：{row.reason}
                  </span>
                  <code>{row.path}</code>
                </div>
              ))}
            </div>
          ) : null}
        </SectionPanel>
      ) : null}

      {hasScanned ? (
        <RecommendationsPanel
          recommendations={recommendations}
          busy={busy}
          onAction={handleRecommendation}
        />
      ) : null}

      {advancedOpen ? (
        <div className="cc-advanced">
          <div className="cc-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`cc-tab ${activeTab === tab.key ? 'on' : ''}`}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="cc-tab-ico" aria-hidden="true">
                  {tab.icon}
                </span>
                {tab.label}
                {tabBadges[tab.key] ? (
                  <span className="cc-tab-badge">{tabBadges[tab.key]}</span>
                ) : null}
              </button>
            ))}
          </div>

          {activeTab === 'categories' ? (
            <div className="cc-tab-panel">
              <section className="cc-panel">
                <div className="cc-panel-head">
                  <h2 className="cc-panel-title">
                    <span className="cc-panel-ico">▦</span>
                    分類總覽
                  </h2>
                </div>
                <p className="cc-panel-desc">
                  每個分類都可以打開說明；關閉「納入清理」的分類不會被一鍵清理處理。
                </p>
                <CategoryCards
                  rows={rows}
                  totalSize={summary.totalSize || 0}
                  includedCategories={includedCategories}
                  onToggleCategory={toggleCategory}
                  onShowInfo={setActiveInfo}
                />
              </section>
            </div>
          ) : null}

          {activeTab === 'files' ? (
            <div className="cc-tab-panel">
              <section className="cc-panel">
                <div className="cc-panel-head">
                  <h2 className="cc-panel-title">
                    <span className="cc-panel-ico">≣</span>
                    檔案明細
                  </h2>
                  {renderAdvancedCleanButton('files')}
                </div>
                <p className="cc-panel-desc">
                  已選 {selectedItems.length} 個項目，預估釋放 {formatBytes(selectedSize)}。
                </p>
                {selectedNeedsReview ? (
                  <InlineAlert tone="danger" title="包含需人工確認項目">
                    已選項目中有 {selectedNeedsReview}{' '}
                    個不是「安全清理」。你仍可清理，但建議先檢查來源路徑與清理影響。
                  </InlineAlert>
                ) : null}
                <FileDetailTable
                  items={items}
                  selected={selected}
                  onToggleItem={toggleItem}
                  categoryFilter={categoryFilter}
                  onCategoryFilter={setCategoryFilter}
                  fileSecurity={fileSecurity}
                  onScanFile={scanFileNow}
                  onCheckReputation={checkReputation}
                  onOpenPath={openPath}
                  onIgnoreFile={(row) => addIgnore({ type: 'file', value: row.path })}
                  onIgnoreFolder={(row) =>
                    addIgnore({ type: 'folder', value: parentFolder(row.path) })
                  }
                />
              </section>
            </div>
          ) : null}

          {activeTab === 'duplicates' ? (
            <div className="cc-tab-panel">
              <section className="cc-panel">
                <div className="cc-panel-head">
                  <h2 className="cc-panel-title">
                    <span className="cc-panel-ico">⧉</span>
                    重複檔案
                  </h2>
                  {renderAdvancedCleanButton('duplicates')}
                </div>
                <p className="cc-panel-desc">
                  內容雜湊相同的檔案群組。用「保留最新，勾選其餘」快速挑出可清理的副本，仍建議逐組確認。
                </p>
                <DuplicateGroups
                  groups={duplicateGroups}
                  items={items}
                  selected={selected}
                  onToggleItem={toggleItem}
                  onKeepNewest={keepNewest}
                  onOpenPath={openPath}
                />
              </section>
            </div>
          ) : null}

          {activeTab === 'system' ? (
            <div className="cc-tab-panel cc-sys-grid">
              <RecycleBinCard
                recycleBin={recycleBin}
                busy={busy}
                onEmpty={emptyRecycleBin}
                onRefresh={refreshRecycleBin}
              />
              <StartupPanel
                startup={startup}
                busy={busy}
                onToggleDisabledMark={toggleStartupMark}
                onOpenPath={openPath}
              />
            </div>
          ) : null}

          {activeTab === 'ignore' ? (
            <div className="cc-tab-panel">
              <IgnoreListManager
                items={ignoreList}
                busy={busy}
                onAdd={addIgnore}
                onRemove={removeIgnore}
              />
            </div>
          ) : null}

          {activeTab === 'logs' ? (
            <div className="cc-tab-panel">
              <section className="cc-panel">
                <div className="cc-panel-head">
                  <h2 className="cc-panel-title">
                    <span className="cc-panel-ico">≡</span>
                    掃描與清理紀錄
                  </h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="ghost" onClick={exportLogs}>
                      匯出紀錄
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.api.cleanup.openLogFile()}
                    >
                      開啟紀錄檔
                    </Button>
                  </div>
                </div>
                <DataTable
                  rows={logs.slice(0, 20)}
                  emptyTitle="尚無紀錄"
                  columns={[
                    { key: 'time', label: '時間', render: (row) => formatTime(row.time || row.at) },
                    { key: 'action', label: '動作' },
                    { key: 'category', label: '分類' },
                    { key: 'result', label: '結果' },
                    { key: 'fileSize', label: '容量', render: (row) => formatBytes(row.fileSize) },
                  ]}
                />
              </section>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeInfo ? (
        <div className="dialog-overlay" role="presentation" onClick={() => setActiveInfo(null)}>
          <div
            className="dialog cleanup-info-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{categoryInfo[activeInfo]?.title || activeInfo}</h3>
            <dl className="cleanup-info-list">
              <dt>這個分類是什麼</dt>
              <dd>
                {categoryInfo[activeInfo]?.what || '此分類用於顯示 Clean Center 掃描到的項目。'}
              </dd>
              <dt>清理後會發生什麼</dt>
              <dd>
                {categoryInfo[activeInfo]?.after ||
                  '項目會依清理方式移到資源回收筒或等待人工處理。'}
              </dd>
              <dt>可能風險</dt>
              <dd>{categoryInfo[activeInfo]?.risk || '請先確認來源路徑與檔案用途。'}</dd>
              <dt>建議是否清理</dt>
              <dd>{categoryInfo[activeInfo]?.recommendation || '建議確認後再清理。'}</dd>
            </dl>
            <div className="dialog-actions">
              <Button variant="primary" onClick={() => setActiveInfo(null)}>
                了解
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cleaningPhase ? (
        <div className="dialog-overlay" role="presentation">
          <div className="dialog cc-clean-modal" role="dialog" aria-modal="true" aria-busy="true">
            {cleaningPhase === 'cleaning' ? (
              <>
                <h3>清理中…</h3>
                <div className="cc-clean-modal-percent">
                  {cleanProgress?.total > 0
                    ? `${Math.min(100, Math.round(((cleanProgress.done || 0) / cleanProgress.total) * 100))}%`
                    : '0%'}
                </div>
                <div className="cc-progress-track">
                  <div
                    className="cc-progress-bar"
                    style={{
                      '--progress': `${
                        cleanProgress?.total > 0
                          ? Math.max(
                              2,
                              Math.min(
                                100,
                                Math.round(((cleanProgress.done || 0) / cleanProgress.total) * 100),
                              ),
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="cc-clean-modal-count">
                  {cleanProgress?.done || 0} / {cleanProgress?.total || '--'} 個檔案
                </p>
                {cleanProgress?.fileName ? (
                  <p className="cc-clean-modal-file" title={cleanProgress.fileName}>
                    {cleanProgress.fileName}
                  </p>
                ) : null}
                <div className="cc-clean-modal-stats">
                  <div>
                    <span>已釋放</span>
                    <strong>{formatBytes(cleanProgress?.freedSize)}</strong>
                  </div>
                  <div>
                    <span>成功</span>
                    <strong>{cleanProgress?.cleaned || 0}</strong>
                  </div>
                  <div>
                    <span>跳過</span>
                    <strong>{cleanProgress?.skipped || 0}</strong>
                  </div>
                  <div>
                    <span>失敗</span>
                    <strong>{cleanProgress?.failed || 0}</strong>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3>清理完成，更新掃描結果中…</h3>
                <div className="cc-progress-track">
                  <div className="cc-progress-bar cc-progress-indeterminate" />
                </div>
                <div className="cc-clean-modal-stats">
                  <div>
                    <span>已釋放</span>
                    <strong>{formatBytes(cleanProgress?.freedSize)}</strong>
                  </div>
                  <div>
                    <span>成功</span>
                    <strong>{cleanProgress?.cleaned || 0}</strong>
                  </div>
                  <div>
                    <span>跳過</span>
                    <strong>{cleanProgress?.skipped || 0}</strong>
                  </div>
                  <div>
                    <span>失敗</span>
                    <strong>{cleanProgress?.failed || 0}</strong>
                  </div>
                </div>
                <p className="cc-clean-modal-file">正在重新掃描，馬上就好——完成後會顯示完整報告。</p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
