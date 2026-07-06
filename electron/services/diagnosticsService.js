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

module.exports = {
  SENSITIVE_KEY_RE,
  REDACTED,
  redactSensitive,
  scrubString,
  diagnosticsFileName,
  summarizeWorkflows,
  summarizeAutomations,
  buildDiagnosticsReport,
};
