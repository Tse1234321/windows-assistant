import { describe, it, expect } from 'vitest';
import { formatBytes, formatGB, formatUptime, usageLevel } from './format.js';

describe('formatBytes', () => {
  it('formats across units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 3)).toBe('1 GB');
  });

  it('respects the decimals argument', () => {
    expect(formatBytes(1536, 2)).toBe('1.5 KB');
    expect(formatBytes(1234567, 2)).toBe('1.18 MB');
  });

  it('treats non-positive input as 0 B', () => {
    expect(formatBytes(-100)).toBe('0 B');
    expect(formatBytes(null)).toBe('0 B');
  });
});

describe('formatGB', () => {
  it('rounds to whole GB', () => {
    expect(formatGB(1024 ** 3 * 8)).toBe('8 GB');
    expect(formatGB(0)).toBe('0 GB');
  });
});

describe('formatUptime', () => {
  it('builds a human-readable duration', () => {
    expect(formatUptime(90)).toBe('1 分鐘');
    expect(formatUptime(3661)).toBe('1 小時 1 分鐘');
    expect(formatUptime(90061)).toBe('1 天 1 小時 1 分鐘');
  });

  it('returns a placeholder for non-positive input', () => {
    expect(formatUptime(0)).toBe('--');
    expect(formatUptime(undefined)).toBe('--');
  });
});

describe('usageLevel', () => {
  it('maps percentages to severity bands', () => {
    expect(usageLevel(10)).toBe('ok');
    expect(usageLevel(70)).toBe('warn');
    expect(usageLevel(84)).toBe('warn');
    expect(usageLevel(85)).toBe('danger');
    expect(usageLevel(99)).toBe('danger');
  });
});
