import React, { useRef } from 'react';
import CleanConfirmPopover from './CleanConfirmPopover.jsx';
import { formatBytes } from './cleanupShared.js';

export default function SmartCleanHero({
  hasScanned,
  busy,
  scanProgress,
  cleanProgress,
  diskUsage,
  safeCount,
  reviewCount,
  dangerCount,
  oneClickCount,
  oneClickSize,
  onScan,
  onOneClickClean,
  confirmOpen,
  onConfirmStart,
  onConfirmCancel,
  advancedOpen,
  onToggleAdvanced,
}) {
  const quickConfirmAnchorRef = useRef(null);
  const cleaning = !!cleanProgress && cleanProgress.done < cleanProgress.total;
  const scanning = busy && !cleaning;
  const progress = cleaning ? cleanProgress : scanProgress;
  const percent =
    progress && progress.total > 0
      ? Math.max(
          3,
          Math.min(100, Math.round(((progress.done ?? progress.scanned ?? 0) / progress.total) * 100)),
        )
      : 0;

  return (
    <section className="cc-hero">
      <div className="cc-hero-main">
        <h2 className="cc-hero-title">
          {hasScanned ? '掃描完成，可以開始清理' : '一鍵掃描，安全釋放磁碟空間'}
        </h2>
        <p className="cc-hero-sub">
          {hasScanned
            ? `找到 ${oneClickCount} 個可安全清理的項目，預估可釋放 ${formatBytes(oneClickSize)}。需要更多控制可切換進階模式。`
            : '以保守規則掃描暫存檔、瀏覽器快取、縮圖、紀錄檔、大檔與重複檔案；清理只移到資源回收筒，可隨時還原。'}
        </p>
        <div className="cc-hero-actions">
          {hasScanned ? (
            <>
              <span className="cc-confirm-anchor" ref={quickConfirmAnchorRef}>
                <button
                  type="button"
                  className="cc-clean-btn"
                  disabled={busy || oneClickCount === 0}
                  onClick={onOneClickClean}
                >
                  <strong>一鍵清理安全項目</strong>
                  <em>
                    {oneClickCount === 0
                      ? '沒有可自動清理的安全項目'
                      : `${oneClickCount} 個項目 · 釋放 ${formatBytes(oneClickSize)}`}
                  </em>
                </button>
                <CleanConfirmPopover
                  open={confirmOpen}
                  anchorRef={quickConfirmAnchorRef}
                  placement="right"
                  title="確認一鍵清理安全項目"
                  count={oneClickCount}
                  size={oneClickSize}
                  note="只清理安全項目並移到資源回收筒；使用中或被鎖定的檔案會自動跳過。"
                  busy={busy}
                  onCancel={onConfirmCancel}
                  actions={[
                    {
                      label: '開始清理',
                      variant: 'primary',
                      disabled: !oneClickCount,
                      onClick: onConfirmStart,
                    },
                  ]}
                />
              </span>
              <button type="button" className="cc-clean-btn secondary" disabled={busy} onClick={onScan}>
                <strong>重新掃描</strong>
                <em>更新掃描結果</em>
              </button>
            </>
          ) : (
            <button type="button" className="cc-clean-btn" disabled={busy} onClick={onScan}>
              <strong>{scanning ? '掃描中…' : '智慧掃描'}</strong>
              <em>{scanning ? '正在分析磁碟內容' : '不會刪除任何檔案，只做分析'}</em>
            </button>
          )}
          <button
            type="button"
            className={`cc-tab ${advancedOpen ? 'on' : ''}`}
            onClick={onToggleAdvanced}
          >
            <span className="cc-tab-ico">⚙</span>
            進階模式
          </button>
        </div>
        {busy || progress ? (
          <div className="cc-progress">
            <div className="cc-progress-head">
              <strong>{cleaning ? '清理中' : progress?.phase || '掃描中'}</strong>
              <span>
                {progress ? `${progress.done ?? progress.scanned ?? 0} / ${progress.total || '--'}` : '--'}
              </span>
            </div>
            {cleaning && cleanProgress?.fileName ? (
              <p className="cc-progress-file">{cleanProgress.fileName}</p>
            ) : null}
            <div className="cc-progress-track">
              <div className="cc-progress-bar" style={{ '--progress': `${percent}%` }} />
            </div>
          </div>
        ) : null}
        <p className="cc-hero-note">
          安全規則：Temp 只預設勾選 7 天以上的檔案；24 小時內、安裝 / 驅動 / Windows Update
          相關暫存與 Downloads、Desktop、Documents 內的檔案不會自動清理。
        </p>
      </div>
      <div
        className="cc-disk-ring"
        style={{ '--disk-used': `${diskUsage?.usedPercent || 0}%` }}
        aria-label="C 槽使用率"
      >
        <strong>{diskUsage?.usedPercent ?? '--'}%</strong>
        <span>C: 使用率</span>
        <em>{diskUsage?.free ? `剩餘 ${formatBytes(diskUsage.free)}` : ''}</em>
      </div>
      <div className="cc-risk-strip">
        <div className="cc-risk-chip ok">
          <span>安全可清</span>
          <strong>{hasScanned ? safeCount : '--'}</strong>
        </div>
        <div className="cc-risk-chip warn">
          <span>需確認</span>
          <strong>{hasScanned ? reviewCount : '--'}</strong>
        </div>
        <div className="cc-risk-chip danger">
          <span>高風險</span>
          <strong>{hasScanned ? dangerCount : '--'}</strong>
        </div>
      </div>
    </section>
  );
}
