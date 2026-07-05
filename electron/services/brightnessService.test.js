import { describe, expect, it } from 'vitest';
import brightnessService from './brightnessService.js';

const {
  clampBrightnessLevel,
  normalizeBrightnessResult,
  parsePowerShellJson,
  buildSetBrightnessScript,
} = brightnessService.__test;

describe('brightnessService helpers', () => {
  it('clamps brightness levels to the Windows range', () => {
    expect(clampBrightnessLevel(-12)).toBe(0);
    expect(clampBrightnessLevel(48.6)).toBe(49);
    expect(clampBrightnessLevel(140)).toBe(100);
    expect(clampBrightnessLevel('75')).toBe(75);
    expect(clampBrightnessLevel('not-a-number')).toBeNull();
    expect(clampBrightnessLevel(null)).toBeNull();
  });

  it('parses the last JSON line from PowerShell output', () => {
    expect(parsePowerShellJson('noise\n{"ok":true,"level":42}\n')).toEqual({
      ok: true,
      level: 42,
    });
  });

  it('normalizes malformed command results to a structured failure', () => {
    expect(normalizeBrightnessResult(null, 55)).toEqual({
      ok: false,
      supported: false,
      level: 55,
      method: 'none',
      error: 'Brightness command did not return a valid response.',
    });
  });

  it('builds set scripts with sanitized numeric targets', () => {
    const script = buildSetBrightnessScript(clampBrightnessLevel(25.4));
    expect(script).toContain('$Target = 25');
  });
});
