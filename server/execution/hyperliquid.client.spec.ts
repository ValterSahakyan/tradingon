import { describe, expect, it } from '@jest/globals';
import { HyperliquidClient } from './hyperliquid.client';

describe('HyperliquidClient fmtPrice', () => {
  const client = new HyperliquidClient({} as any);

  it('keeps perp prices within 5 significant figures', () => {
    expect(client.fmtPrice(1234.56, 0)).toBe('1234.6');
    expect(client.fmtPrice(12345.6, 0)).toBe('12346');
  });

  it('limits decimals to 6 - szDecimals for perp-style assets', () => {
    expect(client.fmtPrice(0.0123456, 1)).toBe('0.01235');
    expect(client.fmtPrice(0.00123456, 0)).toBe('0.001235');
    expect(client.fmtPrice(0.00123456, 4)).toBe('0.01');
  });

  it('removes trailing zeroes from the serialized price', () => {
    expect(client.fmtPrice(100.0, 2)).toBe('100');
    expect(client.fmtPrice(0.290280, 4)).toBe('0.29');
    expect(client.fmtPrice(0.290281, 4)).toBe('0.29');
  });

  it('rounds market-style prices to a valid tick without collapsing to zero', () => {
    expect(client.fmtPrice(0.290281, 4, 'up')).toBe('0.3');
    expect(client.fmtPrice(0.00123456, 4, 'up')).toBe('0.01');
    expect(client.fmtPrice(0.00123456, 4, 'down')).toBe('0.01');
  });
});
