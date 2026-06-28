import { describe, expect, it } from 'vitest';
import { clampPercent, describePercentArc, percentToAngle, polarToCartesian } from './svgArc.js';

describe('svgArc helpers', () => {
  it('clamps invalid and out-of-range percentages', () => {
    expect(clampPercent(-20)).toBe(0);
    expect(clampPercent(35)).toBe(35);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent('nope')).toBe(0);
  });

  it('converts percentage to a bounded sweep angle', () => {
    expect(percentToAngle(0)).toBe(-150);
    expect(percentToAngle(50)).toBe(0);
    expect(percentToAngle(100)).toBe(150);
  });

  it('converts polar coordinates with zero degrees at 12 o clock', () => {
    expect(polarToCartesian(50, 50, 20, 0)).toEqual({ x: 50, y: 30 });
    expect(polarToCartesian(50, 50, 20, 90).x).toBeCloseTo(70);
  });

  it('describes a percent arc path', () => {
    const path = describePercentArc(60, 60, 48, 75);
    expect(path).toContain('A 48 48');
    expect(path.startsWith('M ')).toBe(true);
  });
});
