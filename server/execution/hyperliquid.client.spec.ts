import { describe, expect, it, jest } from '@jest/globals';
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

describe('HyperliquidClient placeMarketOrder', () => {
  it('uses configured market-order slippage when building IOC price', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'hyperliquid.marketOrderSlippage') return 0.01;
        return undefined;
      }),
    };
    const client = new HyperliquidClient(config as any) as any;

    client.assets = new Map([
      ['MAVIA', { index: 110, szDecimals: 2 }],
    ]);
    client.ensureReady = jest.fn(async () => true);
    client.getMidPrice = jest.fn(async () => 100);
    client.sendOrder = jest.fn(async () => ({ status: 'filled', oid: 1, avgPx: 101, totalSz: 1 }));

    await client.placeMarketOrder('MAVIA', true, 1);

    expect(client.sendOrder).toHaveBeenCalledWith([
      expect.objectContaining({
        a: 110,
        b: true,
        p: '101.0001',
        s: '1.00',
      }),
    ]);
  });
});

describe('HyperliquidClient setLeverage', () => {
  it('accepts unified accounts in cross mode when leverage already matches', async () => {
    const client = new HyperliquidClient({} as any) as any;

    client.http = {
      post: jest.fn(),
    };
    client.assets = new Map([
      ['FTT', { index: 51, szDecimals: 1 }],
    ]);
    client.ensureReady = jest.fn(async () => true);
    client.ensureAccountAbstraction = jest.fn(async () => {
      client.accountAbstraction = 'unifiedAccount';
    });
    client.getActiveAssetData = jest.fn(async () => ({
      leverage: { type: 'cross', value: 3 },
    }));

    const result = await client.setLeverage('FTT', 3);

    expect(result).toBe(true);
    expect(client.http.post).not.toHaveBeenCalled();
  });
});
