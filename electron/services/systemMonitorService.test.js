import { describe, expect, it } from 'vitest';
import systemMonitorService from './systemMonitorService.js';

const { computeNetworkRates } = systemMonitorService;

describe('computeNetworkRates', () => {
  it('computes clamped receive and transmit rates', () => {
    const rates = computeNetworkRates(
      { at: 1000, receivedBytes: 1000, sentBytes: 2000 },
      { at: 2000, receivedBytes: 1024 * 1024 + 1000, sentBytes: 1024 * 512 + 2000 },
    );
    expect(rates.available).toBe(true);
    expect(rates.rxMbps).toBe(8);
    expect(rates.txMbps).toBe(4);
    expect(rates.totalMbps).toBe(12);
  });

  it('returns a warmup state without a previous sample or dt', () => {
    expect(computeNetworkRates(null, { at: 1000, receivedBytes: 1, sentBytes: 1 }).available).toBe(
      false,
    );
    expect(
      computeNetworkRates(
        { at: 1000, receivedBytes: 1, sentBytes: 1 },
        { at: 1000, receivedBytes: 2, sentBytes: 2 },
      ).available,
    ).toBe(false);
  });
});
