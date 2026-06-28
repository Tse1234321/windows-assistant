import { describe, it, expect } from 'vitest';
// settingsService is CommonJS; import the default export and destructure.
import settingsService from './settingsService.js';

const { createDefaultSettings, mergeSettings, DEFAULT_SETTINGS } = settingsService;

describe('createDefaultSettings', () => {
  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = createDefaultSettings();
    const b = createDefaultSettings();
    expect(a).not.toBe(b);
    a.general.theme = 'light';
    expect(b.general.theme).toBe('dark');
  });

  it('exposes the expected top-level sections', () => {
    const s = createDefaultSettings();
    for (const key of [
      'general',
      'projectHub',
      'cleanup',
      'healthGuard',
      'overlay',
      'screenshots',
    ]) {
      expect(s).toHaveProperty(key);
    }
    expect(Array.isArray(s.automations)).toBe(true);
  });

  it('DEFAULT_SETTINGS matches a freshly created default', () => {
    expect(DEFAULT_SETTINGS.general.language).toBe(createDefaultSettings().general.language);
  });
});

describe('mergeSettings', () => {
  it('deep-merges general settings over defaults', () => {
    const merged = mergeSettings({ general: { theme: 'dark' } });
    expect(merged.general.theme).toBe('dark');
    // untouched defaults survive
    expect(merged.general.language).toBe('zh');
    expect(merged.general.autoLaunch).toBe(true);
  });

  it('coerces non-array list fields back to arrays', () => {
    const merged = mergeSettings({ modes: 'not-an-array', automations: null, workflows: 5 });
    expect(merged.modes).toEqual([]);
    expect(merged.automations).toEqual([]);
    expect(merged.workflows).toEqual([]);
  });

  it('preserves a valid workflows array', () => {
    const wf = { id: 'w1', name: 'Tidy', enabled: true, nodes: [], edges: [] };
    expect(mergeSettings({ workflows: [wf] }).workflows).toEqual([wf]);
  });

  it('preserves valid array fields', () => {
    const merged = mergeSettings({ automations: [{ id: 'a', enabled: true }] });
    expect(merged.automations).toHaveLength(1);
    expect(merged.automations[0].id).toBe('a');
  });

  it('merges nested screenshot organizer flags', () => {
    const merged = mergeSettings({ screenshots: { organizer: { organizeByDate: false } } });
    expect(merged.screenshots.organizer.organizeByDate).toBe(false);
    // sibling defaults retained
    expect(merged.screenshots.organizer.renameConflicts).toBe(true);
  });

  it('keeps healthGuard thresholds when partially overridden', () => {
    const merged = mergeSettings({ healthGuard: { cpuTempC: 90 } });
    expect(merged.healthGuard.cpuTempC).toBe(90);
    expect(merged.healthGuard.ramPercent).toBe(85);
  });

  it('tolerates an empty object', () => {
    const merged = mergeSettings({});
    expect(merged.general.theme).toBe('dark');
    expect(merged.automations).toEqual([]);
  });
});
