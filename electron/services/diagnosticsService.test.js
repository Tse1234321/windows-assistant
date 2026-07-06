import { describe, it, expect } from 'vitest';
import diagnostics from './diagnosticsService.js';

const {
  redactSensitive,
  scrubString,
  diagnosticsFileName,
  summarizeWorkflows,
  summarizeAutomations,
  buildDiagnosticsReport,
  analyzeDiagnostics,
  REDACTED,
} = diagnostics;

const healthyMetrics = {
  storage: { ok: true },
  scheduler: { automationTimer: true, workflowTimer: true, cleanupTimer: true },
  watcher: { enabled: true, paused: false, watched: 3 },
  workflows: { total: 2, enabled: 1 },
  automations: { total: 1, enabled: 1 },
  errorCount: 0,
};

describe('redactSensitive', () => {
  it('masks sensitive keys but keeps structure and safe values', () => {
    const input = {
      general: { downloadsPath: 'C:/Users/U/Downloads', notifications: true },
      apiKey: 'sk-live-abc123',
      virusTotalToken: 'vt-xyz',
      password: 'hunter2',
      clientSecret: 'shh',
      authorization: 'Basic abc',
      cookie: 'session=1',
      nested: { list: [{ ACCESS_KEY: 'aws' }, { safe: 1 }] },
    };
    const out = redactSensitive(input);
    expect(out.general.downloadsPath).toBe('C:/Users/U/Downloads');
    expect(out.general.notifications).toBe(true);
    expect(out.apiKey).toBe(REDACTED);
    expect(out.virusTotalToken).toBe(REDACTED);
    expect(out.password).toBe(REDACTED);
    expect(out.clientSecret).toBe(REDACTED);
    expect(out.authorization).toBe(REDACTED);
    expect(out.cookie).toBe(REDACTED);
    expect(out.nested.list[0].ACCESS_KEY).toBe(REDACTED);
    expect(out.nested.list[1].safe).toBe(1);
    // Original object must not be mutated.
    expect(input.apiKey).toBe('sk-live-abc123');
  });

  it('keeps falsy sensitive values so "not configured" stays visible', () => {
    const out = redactSensitive({ apiKey: '', token: null, password: false });
    expect(out.apiKey).toBe('');
    expect(out.token).toBe(null);
    expect(out.password).toBe(false);
  });

  it('scrubs bearer tokens and key:value fragments inside free-form strings', () => {
    expect(scrubString('auth header Bearer abc.def-123 sent')).not.toContain('abc.def-123');
    const logLine = 'runProgram config {"command":"curl","token":"tok_123","cwd":"C:/x"}';
    const scrubbed = scrubString(logLine);
    expect(scrubbed).not.toContain('tok_123');
    expect(scrubbed).toContain('"command":"curl"');
    expect(scrubbed).toContain('"cwd":"C:/x"');
  });

  it('survives circular references instead of throwing', () => {
    const a = { name: 'x' };
    a.self = a;
    const out = redactSensitive(a);
    expect(out.name).toBe('x');
    expect(out.self).toBe('[Circular]');
  });
});

describe('diagnosticsFileName', () => {
  it('formats as nexus-diagnostics-YYYYMMDD-HHmmss.json', () => {
    const name = diagnosticsFileName(new Date(2026, 6, 6, 9, 5, 3));
    expect(name).toBe('nexus-diagnostics-20260706-090503.json');
  });
});

describe('summaries', () => {
  it('summarizes workflows with node types and redacted config', () => {
    const [summary] = summarizeWorkflows([
      {
        id: 'wf1',
        name: 'Nightly',
        enabled: true,
        nodes: [
          { id: 't1', kind: 'trigger', type: 'schedule', config: { time: '09:00' } },
          {
            id: 'a1',
            kind: 'action',
            type: 'runProgram',
            config: { command: 'deploy.exe', apiKey: 'sk-123' },
          },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'a1' }],
      },
    ]);
    expect(summary.nodeCount).toBe(2);
    expect(summary.edgeCount).toBe(1);
    expect(summary.hasSchedule).toBe(true);
    expect(summary.triggers).toEqual(['schedule']);
    expect(summary.actions).toEqual(['runProgram']);
    expect(summary.nodes[1].config.command).toBe('deploy.exe');
    expect(summary.nodes[1].config.apiKey).toBe(REDACTED);
  });

  it('summarizes automations and handles empty/invalid input', () => {
    expect(summarizeWorkflows(undefined)).toEqual([]);
    expect(summarizeAutomations(null)).toEqual([]);
    const [rule] = summarizeAutomations([
      {
        id: 'r1',
        name: 'Sort PDFs',
        enabled: false,
        condition: { type: 'extension', value: '.pdf' },
        action: { type: 'move', target: 'C:/Docs', password: 'p' },
      },
    ]);
    expect(rule.enabled).toBe(false);
    expect(rule.conditionType).toBe('extension');
    expect(rule.actionType).toBe('move');
    expect(rule.action.target).toBe('C:/Docs');
    expect(rule.action.password).toBe(REDACTED);
  });
});

describe('buildDiagnosticsReport', () => {
  it('keeps successful sections and records failed ones without aborting', () => {
    const report = buildDiagnosticsReport({
      environment: { ok: true, data: { appVersion: '2.5.6' } },
      recentLogs: { ok: false, error: 'EACCES: permission denied' },
    });
    expect(report.bundle).toBe('nexus-diagnostics');
    expect(report.environment.appVersion).toBe('2.5.6');
    expect(report.recentLogs).toBe(null);
    expect(report.sectionErrors.recentLogs).toContain('EACCES');
    expect(report.generatedAt).toBeTruthy();
  });

  it('applies redaction to section payloads', () => {
    const report = buildDiagnosticsReport({
      settings: { ok: true, data: { snapshot: { apiKey: 'sk-1', theme: 'dark' } } },
    });
    expect(report.settings.snapshot.apiKey).toBe(REDACTED);
    expect(report.settings.snapshot.theme).toBe('dark');
  });
});

describe('analyzeDiagnostics', () => {
  it('reports "no problems" when everything is healthy', () => {
    const { overall, findings } = analyzeDiagnostics(healthyMetrics);
    expect(overall).toBe('ok');
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe('ok');
    expect(findings[0].title).toContain('未發現明顯問題');
  });

  it('flags unwritable storage as an error with the highest overall severity', () => {
    const { overall, findings } = analyzeDiagnostics({
      ...healthyMetrics,
      storage: { ok: false, error: 'EACCES' },
    });
    expect(overall).toBe('error');
    const storageFinding = findings.find((f) => f.level === 'error');
    expect(storageFinding.title).toContain('設定無法讀寫');
    expect(storageFinding.detail).toContain('EACCES');
  });

  it('warns when a scheduler timer is not running', () => {
    const { overall, findings } = analyzeDiagnostics({
      ...healthyMetrics,
      scheduler: { automationTimer: true, workflowTimer: false, cleanupTimer: true },
    });
    expect(overall).toBe('warn');
    expect(findings.some((f) => f.title.includes('排程服務未完全啟動'))).toBe(true);
  });

  it('distinguishes disabled (info) from paused (warn) watcher states', () => {
    const disabled = analyzeDiagnostics({ ...healthyMetrics, watcher: { enabled: false } });
    expect(disabled.overall).toBe('ok'); // info-only does not raise overall
    expect(disabled.findings.some((f) => f.level === 'info')).toBe(true);

    const paused = analyzeDiagnostics({
      ...healthyMetrics,
      watcher: { enabled: true, paused: true },
    });
    expect(paused.overall).toBe('warn');
    expect(paused.findings.some((f) => f.title.includes('暫停'))).toBe(true);
  });

  it('surfaces recent error count', () => {
    const { findings } = analyzeDiagnostics({ ...healthyMetrics, errorCount: 4 });
    expect(findings.some((f) => f.title.includes('4 筆錯誤'))).toBe(true);
  });

  it('tolerates missing metrics without throwing', () => {
    const { overall, findings } = analyzeDiagnostics();
    expect(['ok', 'warn', 'error']).toContain(overall);
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
  });
});
