import { describe, it, expect } from 'vitest';
import {
  formatEng,
  parseEng,
  ohmsLaw,
  voltageDivider,
  rcFilter,
  rlFilter,
  lcResonance,
  combineResistors,
  combineCapacitors,
  decodeResistorColors,
  encodeResistorValue,
  parseInBase,
  toBases,
} from './eeMath.js';

describe('formatEng', () => {
  it('formats with SI prefixes', () => {
    expect(formatEng(4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatEng(1_000_000, 'Hz')).toBe('1 MHz');
    expect(formatEng(0.0000022, 'F')).toBe('2.2 µF');
  });

  it('handles zero and non-finite values', () => {
    expect(formatEng(0, 'Ω')).toBe('0 Ω');
    expect(formatEng(Infinity, 'Ω')).toBe('—');
    expect(formatEng(NaN, 'Ω')).toBe('—');
  });
});

describe('parseEng', () => {
  it('parses engineering-notation strings', () => {
    expect(parseEng('4.7k')).toBeCloseTo(4700);
    expect(parseEng('2.2u')).toBeCloseTo(0.0000022);
    // Mega is spelled out as "meg"; a bare m/M is milli (case-insensitive).
    expect(parseEng('1meg')).toBeCloseTo(1_000_000);
    expect(parseEng('10m')).toBeCloseTo(0.01);
    expect(parseEng('10M')).toBeCloseTo(0.01);
  });

  it('passes numbers through and strips units', () => {
    expect(parseEng(1234)).toBe(1234);
    expect(parseEng('4.7kΩ')).toBeCloseTo(4700);
  });

  it('treats empty input as not-provided (NaN), not zero', () => {
    expect(parseEng('')).toBeNaN();
    expect(parseEng('   ')).toBeNaN();
    expect(parseEng(null)).toBeNaN();
  });
});

describe('ohmsLaw', () => {
  it('solves from voltage and current', () => {
    const r = ohmsLaw({ v: 10, i: 2 });
    expect(r.r).toBeCloseTo(5);
    expect(r.p).toBeCloseTo(20);
  });

  it('solves from power and resistance', () => {
    const r = ohmsLaw({ p: 100, r: 25 });
    expect(r.v).toBeCloseTo(50);
    expect(r.i).toBeCloseTo(2);
  });

  it('returns NaN when underdetermined', () => {
    const r = ohmsLaw({ v: 10 });
    expect(r.i).toBeNaN();
  });
});

describe('reactive helpers', () => {
  it('voltage divider', () => {
    expect(voltageDivider({ vin: 10, r1: 1000, r2: 1000 }).vout).toBeCloseTo(5);
  });

  it('RC filter cutoff', () => {
    const { tau, fc } = rcFilter(1000, 1e-6);
    expect(tau).toBeCloseTo(0.001);
    expect(fc).toBeCloseTo(159.15, 1);
  });

  it('RL filter cutoff', () => {
    const { tau, fc } = rlFilter(1000, 1);
    expect(tau).toBeCloseTo(0.001);
    expect(fc).toBeCloseTo(159.15, 1);
  });

  it('LC resonance', () => {
    expect(lcResonance(1e-3, 1e-6).f).toBeCloseTo(5032.92, 1);
  });
});

describe('combine resistors / capacitors', () => {
  it('resistors series add, parallel reduce', () => {
    expect(combineResistors([100, 200, 300], 'series')).toBe(600);
    expect(combineResistors([100, 100], 'parallel')).toBeCloseTo(50);
  });

  it('capacitors are the inverse of resistors', () => {
    expect(combineCapacitors([100, 100], 'parallel')).toBe(200);
    expect(combineCapacitors([100, 100], 'series')).toBeCloseTo(50);
  });

  it('ignores invalid values and returns NaN when empty', () => {
    expect(combineResistors([NaN, -5, 0], 'series')).toBeNaN();
  });
});

describe('resistor colour code', () => {
  it('decodes a 4-band resistor', () => {
    // yellow(4) violet(7) red(x100) gold(±5%) -> 4700Ω
    const r = decodeResistorColors(['yellow', 'violet', 'red', 'gold']);
    expect(r.ohms).toBe(4700);
    expect(r.tolerance).toBe(5);
  });

  it('decodes a 5-band resistor', () => {
    // brown(1) black(0) black(0) brown(x10) brown(±1%) -> 1000Ω
    const r = decodeResistorColors(['brown', 'black', 'black', 'brown', 'brown']);
    expect(r.ohms).toBe(1000);
    expect(r.tolerance).toBe(1);
  });

  it('rejects malformed band arrays', () => {
    expect(decodeResistorColors(['red']).ohms).toBeNaN();
  });

  it('encode is the inverse of decode', () => {
    const enc = encodeResistorValue(4700, 4);
    expect(enc).not.toBeNull();
    expect(enc.value).toBe(4700);
    expect(enc.exact).toBe(true);
    const dec = decodeResistorColors([...enc.bands, 'gold']);
    expect(dec.ohms).toBe(4700);
  });

  it('encode rejects non-positive values', () => {
    expect(encodeResistorValue(0)).toBeNull();
    expect(encodeResistorValue(-10)).toBeNull();
  });
});

describe('base conversion', () => {
  it('parses integers in a given base', () => {
    expect(parseInBase('ff', 16)).toBe(255);
    expect(parseInBase('1010', 2)).toBe(10);
    expect(parseInBase('0xFF', 16)).toBe(255);
  });

  it('rejects digits outside the base', () => {
    expect(parseInBase('2', 2)).toBeNaN();
    expect(parseInBase('', 10)).toBeNaN();
  });

  it('converts to all bases', () => {
    expect(toBases(255)).toEqual({ bin: '11111111', oct: '377', dec: '255', hex: 'FF' });
    expect(toBases(NaN)).toEqual({ bin: '', oct: '', dec: '', hex: '' });
  });
});
