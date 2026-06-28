import React, { useEffect, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import Button from '../components/Button.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatBytes } from '../utils/format.js';

const MAX_LOG_LINES = 800;

const consoleStyle = {
  fontFamily: '"Cascadia Code","Consolas",monospace',
  fontSize: 12,
  lineHeight: 1.5,
  background: '#0d1117',
  color: '#d6deeb',
  borderRadius: 10,
  padding: 12,
  height: 200,
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  border: '1px solid var(--border)',
};

function LogConsole({ lines }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div style={consoleStyle} ref={ref}>
      {lines.length === 0 ? (
        <span style={{ opacity: 0.5 }}>（尚無輸出）</span>
      ) : (
        lines.map((l, i) => <div key={i}>{l}</div>)
      )}
    </div>
  );
}

export default function PdfTools() {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null); // { kind, receivedBytes, totalBytes, percent, extracting, done }
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const refresh = async () => {
    if (!window.api?.stirling) {
      setLoading(false);
      return;
    }
    const s = await window.api.stirling.getStatus().catch(() => null);
    if (s?.ok) setStatus(s);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    if (!window.api?.stirling) return undefined;
    const offProgress = window.api.stirling.onProgress((p) => setProgress(p));
    const offStatus = window.api.stirling.onStatus((srv) => {
      setStatus((prev) => (prev ? { ...prev, server: srv } : prev));
    });
    const offLog = window.api.stirling.onLog((line) =>
      setLogs((prev) => {
        const next = [...prev, line];
        return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
      }),
    );
    return () => {
      offProgress && offProgress();
      offStatus && offStatus();
      offLog && offLog();
    };
  }, []);

  const java = status?.java || {};
  const jar = status?.jar || {};
  const server = status?.server || {};
  const showProgress = !!progress && !progress.done && (busy || (progress.percent || 0) < 100);

  const runDownload = async (fn, okMsg) => {
    setBusy(true);
    setProgress({ percent: 0 });
    try {
      const r = await fn();
      if (r?.ok) toast(okMsg, 'ok');
      else {
        toast(r?.error || '失敗', 'error');
        setProgress(null);
      }
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const doDownloadJre = () =>
    runDownload(() => window.api.stirling.downloadJre(), 'Java 執行環境已就緒');
  const doDownloadJar = () =>
    runDownload(() => window.api.stirling.download(), 'Stirling-PDF 下載完成');

  const doStart = async () => {
    setBusy(true);
    setShowLogs(true);
    setLogs([]);
    try {
      const r = await window.api.stirling.start({});
      if (r?.ok) toast('Stirling-PDF 已啟動', 'ok');
      else toast(r?.error || '啟動失敗', 'error');
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const doStop = async () => {
    setBusy(true);
    try {
      await window.api.stirling.stop();
      toast('Stirling-PDF 已停止', 'ok');
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const openBrowser = () => window.api?.stirling?.openExternal?.();

  const renderActions = () => {
    if (!java.available) {
      return (
        <Button variant="primary" onClick={doDownloadJre} busy={busy} disabled={busy}>
          下載執行環境（Java 25，約 56 MB）
        </Button>
      );
    }
    if (server.running) {
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={openBrowser}>
            用瀏覽器開啟
          </Button>
          <Button variant="danger" onClick={doStop} busy={busy}>
            停止
          </Button>
        </div>
      );
    }
    if (server.starting)
      return (
        <Button variant="primary" busy disabled>
          啟動中…
        </Button>
      );
    if (!jar.present) {
      return (
        <Button variant="primary" onClick={doDownloadJar} busy={busy} disabled={busy}>
          下載 Stirling-PDF（約 275 MB）
        </Button>
      );
    }
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" onClick={doDownloadJar} disabled={busy} title="重新下載最新版">
          更新
        </Button>
        <Button variant="primary" onClick={doStart} busy={busy} disabled={busy}>
          啟動
        </Button>
      </div>
    );
  };

  const runtimeLabel = java.available
    ? java.source === 'bundled'
      ? '執行環境就緒（內建 Java 25）'
      : `執行環境就緒（系統 Java ${java.systemVersion || java.systemMajor}）`
    : java.systemAvailable
      ? `需要 Java 25（系統為 ${java.systemVersion || java.systemMajor}）`
      : '需要 Java 25';

  const progressLabel = progress?.extracting
    ? '解壓縮中…'
    : progress?.kind === 'jre'
      ? '下載執行環境'
      : '下載 Stirling-PDF';

  return (
    <div>
      <PageHeader
        eyebrow="PDF"
        title="PDF 工具"
        description="內建 Stirling-PDF：合併、分割、轉換、壓縮、OCR、簽署等 50+ 個 PDF 工具，完全在本機執行，檔案不會上傳到雲端。首次使用會下載執行環境與官方版本（皆存於本機，不隨安裝檔散布）。"
      />

      <SectionPanel
        title="Stirling-PDF"
        eyebrow="LOCAL PDF TOOLBOX"
        description="官方 JAR 與 Java 25 執行環境於首次使用時下載到本機，之後直接啟動。"
        actions={renderActions()}
      >
        {loading ? (
          <div style={{ opacity: 0.6 }}>讀取狀態中…</div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: 12,
              }}
            >
              <StatusBadge tone={java.available ? 'ok' : 'warn'}>{runtimeLabel}</StatusBadge>
              <StatusBadge tone={jar.present ? 'ok' : 'muted'}>
                {jar.present
                  ? `已下載${jar.version ? ` ${jar.version}` : ''}${jar.sizeBytes ? `（${formatBytes(jar.sizeBytes)}）` : ''}`
                  : 'Stirling-PDF 尚未下載'}
              </StatusBadge>
              <StatusBadge tone={server.running ? 'ok' : server.starting ? 'warn' : 'muted'}>
                {server.running ? `執行中 :${server.port}` : server.starting ? '啟動中…' : '已停止'}
              </StatusBadge>
            </div>

            {showProgress ? (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    height: 8,
                    borderRadius: 6,
                    background: 'var(--surface-2, #1f2937)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${progress?.percent || 0}%`,
                      background: 'var(--accent, #4f8cff)',
                      transition: 'width .2s',
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                  {progressLabel} {progress?.percent || 0}%
                  {progress?.totalBytes
                    ? `（${formatBytes(progress.receivedBytes || 0)} / ${formatBytes(progress.totalBytes)}）`
                    : ''}
                </div>
              </div>
            ) : null}

            {server.error ? (
              <div style={{ marginBottom: 12, color: '#ff7b72', fontSize: 13 }}>{server.error}</div>
            ) : null}

            {server.starting || (showLogs && logs.length > 0) ? (
              <div style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowLogs((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #94a3b8)',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: 0,
                    marginBottom: 6,
                  }}
                >
                  {showLogs ? '▾ 隱藏伺服器日誌' : '▸ 顯示伺服器日誌'}
                </button>
                {showLogs ? <LogConsole lines={logs} /> : null}
              </div>
            ) : null}
          </>
        )}
      </SectionPanel>

      {server.running && server.url ? (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#fff',
            height: 'calc(100vh - 360px)',
            minHeight: 480,
          }}
        >
          <webview
            src={server.url}
            allowpopups="true"
            style={{ width: '100%', height: '100%', border: 'none', display: 'inline-flex' }}
          />
        </div>
      ) : null}
    </div>
  );
}
