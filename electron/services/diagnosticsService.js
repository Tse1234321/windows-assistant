'use strict';

/**
 * Diagnostics bundle builder — pure helpers behind the "匯出診斷包" button.
 *
 * Everything here is side-effect-free (no fs, no electron) so it can be unit
 * tested in plain Node; main.js supplies the runtime sections (versions, timer
 * state, log tails) and handles the save dialog + file write. The bundle is a
 * single JSON document: readable, diffable, and needs no zip dependency.
 *
 * Privacy: the settings snapshot, rule/workflow summaries, and log lines all
 * pass through `redactSensitive` before they leave the process, so secrets
 * (api keys, tokens, passwords, cookies, bearer headers) never end up in an
 * exported file — only the structure and non-sensitive values survive.
 */

/** Object keys whose values must never be exported. */
const SENSITIVE_KEY_RE =
  /(api[-_]?key|access[-_]?key|token|passwd|password|secret|authorization|bearer|cookie|credential)/i;

/** "Bearer <token>" fragments inside free-form strings (e.g. log messages). */
const BEARER_IN_TEXT_RE = /\bbearer\s+[a-z0-9._~+/=-]{4,}/gi;

/**
 * `key: value` / `"key":"value"` fragments inside free-form strings. Log lines
 * often embed serialized configs, so key-based object redaction alone is not
 * enough.
 */
const KEY_VALUE_IN_TEXT_RE =
  /("?(?:api[-_]?key|access[-_]?key|token|passwd|password|secret|authorization|cookie|credential)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}"']+)/gi;

const REDACTED = '[REDACTED]';

function scrubString(text) {
  return String(text)
    .replace(BEARER_IN_TEXT_RE, REDACTED)
    .replace(KEY_VALUE_IN_TEXT_RE, (_match, prefix) => `${prefix}${REDACTED}`);
}

/**
 * Deep-copy `value` with sensitive parts masked. Structure and non-sensitive
 * values are preserved; empty/null sensitive fields stay as-is so the export
 * still shows "not configured" states.
 */
function redactSensitive(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, seen));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      // Keep falsy values (null / '' / false) so "not set" remains visible.
      out[key] = val ? REDACTED : val;
    } else {
      out[key] = redactSensitive(val, seen);
    }
  }
  return out;
}

/** nexus-diagnostics-YYYYMMDD-HHmmss.json */
function diagnosticsFileName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `nexus-diagnostics-${stamp}.json`;
}

/** Compact per-workflow summary: shape and state, no folder contents. */
function summarizeWorkflows(workflows) {
  return (Array.isArray(workflows) ? workflows : []).filter(Boolean).map((wf) => {
    const nodes = Array.isArray(wf.nodes) ? wf.nodes.filter(Boolean) : [];
    return {
      id: wf.id || null,
      name: wf.name || '',
      enabled: wf.enabled !== false,
      nodeCount: nodes.length,
      edgeCount: Array.isArray(wf.edges) ? wf.edges.length : 0,
      triggers: nodes.filter((n) => n.kind === 'trigger').map((n) => n.type),
      conditions: nodes.filter((n) => n.kind === 'condition').map((n) => n.type),
      actions: nodes.filter((n) => n.kind === 'action').map((n) => n.type),
      hasSchedule: nodes.some((n) => n.kind === 'trigger' && n.type === 'schedule'),
      nodes: nodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        type: n.type,
        config: redactSensitive(n.config || {}),
      })),
    };
  });
}

/** Compact per-rule summary for legacy flat automations. */
function summarizeAutomations(automations) {
  return (Array.isArray(automations) ? automations : []).filter(Boolean).map((rule) => ({
    id: rule.id || null,
    name: rule.name || '',
    enabled: rule.enabled !== false,
    conditionType: (rule.condition && rule.condition.type) || null,
    actionType: (rule.action && rule.action.type) || null,
    condition: redactSensitive(rule.condition || {}),
    action: redactSensitive(rule.action || {}),
  }));
}

/**
 * Assemble the final report from independently-collected sections. `sections`
 * is a map of name -> { ok, data?, error? }; a failed section contributes its
 * error message instead of aborting the whole bundle.
 */
function buildDiagnosticsReport(sections = {}, meta = {}) {
  const report = {
    bundle: 'nexus-diagnostics',
    bundleVersion: 1,
    generatedAt: meta.generatedAt || new Date().toISOString(),
    sectionErrors: {},
  };
  for (const [name, section] of Object.entries(sections)) {
    if (section && section.ok !== false) {
      report[name] = redactSensitive(section.data !== undefined ? section.data : section);
    } else {
      report[name] = null;
      report.sectionErrors[name] = (section && section.error) || 'unknown collection error';
    }
  }
  return report;
}

/**
 * Turn the raw diagnostics metrics into a short, plain-language verdict a
 * non-technical user can act on — the "看不出問題" fix. Both the live panel and
 * the exported bundle call this, so the summary the user sees on screen is
 * exactly what a support person reads at the top of the JSON file.
 *
 * @param {object} metrics
 *   { storage:{ok,error}, scheduler:{automationTimer,workflowTimer,cleanupTimer},
 *     watcher:{enabled,paused,watched}, workflows:{total,enabled},
 *     automations:{total,enabled}, errorCount }
 * @returns {{ overall: 'ok'|'warn'|'error', findings: Array<{level,title,detail}> }}
 */
function analyzeDiagnostics(metrics = {}) {
  const findings = [];
  const storage = metrics.storage || {};
  const scheduler = metrics.scheduler || {};
  const watcher = metrics.watcher || {};
  const errorCount = Number(metrics.errorCount || 0);

  // Most severe first: can the app even save its own data?
  if (storage.ok === false) {
    findings.push({
      level: 'error',
      title: '本機設定無法讀寫',
      detail:
        '你的設定與規則可能無法儲存。請確認硬碟還有空間、App 有寫入權限，' +
        '再試「重新初始化本機設定」。' + (storage.error ? `（原因：${storage.error}）` : ''),
    });
  }

  // Are the background schedulers actually running?
  const timers = [scheduler.automationTimer, scheduler.workflowTimer, scheduler.cleanupTimer];
  const startedTimers = timers.filter((value) => value === true).length;
  if (timers.some((value) => value === false)) {
    findings.push({
      level: 'warn',
      title: '排程服務未完全啟動',
      detail:
        `目前只有 ${startedTimers} / 3 個排程計時器在執行，部分排程可能不會自動觸發。` +
        '按下方「重新載入排程」通常即可修復。',
    });
  }

  // Folder watching state (disabled is a choice, paused is usually accidental).
  if (watcher.enabled === false) {
    findings.push({
      level: 'info',
      title: '資料夾監控已停用',
      detail: '新檔案不會自動觸發整理或工作流。可到「自動化」設定重新開啟。',
    });
  } else if (watcher.paused === true) {
    findings.push({
      level: 'warn',
      title: '資料夾監控已暫停',
      detail: '系統匣選單或設定把監控暫停了，暫停期間不會偵測新檔案。',
    });
  }

  // Recent errors are a hint that something misbehaved.
  if (errorCount > 0) {
    findings.push({
      level: 'warn',
      title: `最近有 ${errorCount} 筆錯誤紀錄`,
      detail: '代表某些功能執行時發生過錯誤。匯出診斷包並提供給開發者可協助分析。',
    });
  }

  if (!findings.length) {
    findings.push({
      level: 'ok',
      title: '未發現明顯問題',
      detail: 'App 各項服務目前運作正常。',
    });
  }

  const overall = findings.some((f) => f.level === 'error')
    ? 'error'
    : findings.some((f) => f.level === 'warn')
      ? 'warn'
      : 'ok';
  return { overall, findings };
}

module.exports = {
  SENSITIVE_KEY_RE,
  REDACTED,
  redactSensitive,
  scrubString,
  diagnosticsFileName,
  summarizeWorkflows,
  summarizeAutomations,
  buildDiagnosticsReport,
  analyzeDiagnostics,
};
