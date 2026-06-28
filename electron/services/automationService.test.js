import { describe, it, expect } from 'vitest';
import automationService from './automationService.js';

const { matches, scheduleDueFor, markScheduleFired } = automationService;

describe('matches (the predicate the workflow engine relies on)', () => {
  it('extension: normalizes a missing dot and is case-insensitive', () => {
    expect(matches({ type: 'extension', value: 'pdf' }, { ext: '.PDF' })).toBe(true);
    expect(matches({ type: 'extension', value: '.pdf' }, { ext: '.pdf' })).toBe(true);
    expect(matches({ type: 'extension', value: 'pdf' }, { ext: '.png' })).toBe(false);
    expect(matches({ type: 'extension', value: '' }, { ext: '.pdf' })).toBe(false);
  });

  it('sizeGreaterThan compares against a MB threshold', () => {
    expect(matches({ type: 'sizeGreaterThan', value: 1 }, { size: 2 * 1024 * 1024 })).toBe(true);
    expect(matches({ type: 'sizeGreaterThan', value: 5 }, { size: 1 * 1024 * 1024 })).toBe(false);
  });

  it('newFileInFolder and schedule are always-true gates', () => {
    expect(matches({ type: 'newFileInFolder' }, {})).toBe(true);
    expect(matches({ type: 'schedule' }, {})).toBe(true);
  });

  it('unknown / missing conditions do not match', () => {
    expect(matches({ type: 'nope' }, {})).toBe(false);
    expect(matches(null, {})).toBe(false);
  });
});

describe('scheduleDueFor (scheduled-workflow timing + dedupe)', () => {
  it('interval mode: due on first check, then suppressed once marked fired', () => {
    const key = 'test-interval-1';
    expect(scheduleDueFor(key, { everyMinutes: 5 })).toBe(true);
    markScheduleFired(key);
    expect(scheduleDueFor(key, { everyMinutes: 5 })).toBe(false);
  });

  it('daily mode: due only inside the one-minute target window', () => {
    const key = 'test-daily-1';
    const at = (hhmm) => new Date(`2024-01-01T${hhmm}:00`);
    expect(scheduleDueFor(key, { scheduleMode: 'daily', time: '09:00' }, at('09:00'))).toBe(true);
    expect(scheduleDueFor(key, { scheduleMode: 'daily', time: '09:00' }, at('10:00'))).toBe(false);
  });

  it('weekly mode: only fires on the configured day of week', () => {
    const key = 'test-weekly-1';
    // 2024-01-01 is a Monday (getDay() === 1)
    const monday = new Date('2024-01-01T09:00:00');
    const tuesday = new Date('2024-01-02T09:00:00');
    expect(
      scheduleDueFor(key, { scheduleMode: 'weekly', time: '09:00', dayOfWeek: 1 }, monday),
    ).toBe(true);
    markScheduleFired(key);
    expect(
      scheduleDueFor(`${key}-b`, { scheduleMode: 'weekly', time: '09:00', dayOfWeek: 1 }, tuesday),
    ).toBe(false);
  });
});
