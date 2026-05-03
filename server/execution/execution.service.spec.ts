import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppConfigService } from '../config/app-config.service';
import { ExecutionService } from './execution.service';

describe('ExecutionService', () => {
  let config: { get: any };
  let hl: any;
  let service: ExecutionService;

  beforeEach(() => {
    config = {
      get: (jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'execution.enabled': true,
          'execution.allowMainnet': true,
          'hyperliquid.testnet': false,
          'capital.leverage': 3,
          'capital.leverageScore2': 3,
          'capital.leverageScore3': 3,
          'capital.leverageScore4': 3,
          'capital.minOrderNotional': 10,
          'capital.freeCollateralBufferUsd': 1,
          'hyperliquid.exchangeMinOrderNotional': 10,
          'exits.tp1ClosePercent': 50,
          'exits.tp2ClosePercent': 35,
          'exits.tp3ClosePercent': 15,
        };
        return values[key];
      }) as any),
    };

    hl = {
      setLeverage: (jest.fn(() => Promise.resolve(true)) as any),
      placeMarketOrder: jest.fn() as any,
      getMidPrice: jest.fn() as any,
      getAccountValue: jest.fn() as any,
      getAvailableCollateral: jest.fn(() => Promise.resolve(100)) as any,
    };

    service = new ExecutionService(config as unknown as AppConfigService, hl as any);
  });

  it('refuses to open positions when execution is disabled', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'execution.enabled') return false;
      if (key === 'exits.stopLossPercent') return 7;
      if (key === 'capital.leverage') return 3;
      return undefined;
    });

    const result = await service.openPosition({
      token: 'SOL',
      direction: 'long',
      score: 2,
      patternsFired: ['volume_spike', 'accumulation_breakout'],
      currentPrice: 10,
      suggestedMargin: 10,
      notional: 30,
      leverage: 3,
      stopPrice: 9.3,
      tp1Price: 10.7,
      tp2Price: 11.4,
      marketCondition: 'sideways',
    });

    expect(result).toBeNull();
    expect(hl.setLeverage).not.toHaveBeenCalled();
    expect(hl.placeMarketOrder).not.toHaveBeenCalled();
  });

  it('builds a position from actual fill values', async () => {
    hl.placeMarketOrder.mockImplementation(() => Promise.resolve({
      status: 'filled',
      avgPx: 12,
      totalSz: 6,
    }));

    const result = await service.openPosition({
      token: 'SOL',
      direction: 'long',
      score: 3,
      patternsFired: ['volume_spike', 'accumulation_breakout', 'fibonacci'],
      currentPrice: 10,
      suggestedMargin: 15,
      notional: 60,
      leverage: 4,
      stopPrice: 9.3,
      tp1Price: 10.7,
      tp2Price: 11.4,
      marketCondition: 'sideways',
    });

    expect(result).not.toBeNull();
    expect(result?.entryPrice).toBe(12);
    expect(result?.size).toBe(6);
    expect(result?.notional).toBe(72);
    expect(result?.leverage).toBe(4);
    expect(result?.margin).toBe(15);
    expect(result?.realizedPnl).toBe(0);
    expect(result?.stopPrice).toBeCloseTo(9.3);
    expect(result?.tp1Price).toBeCloseTo(10.7);
    expect(result?.tp2Price).toBeCloseTo(11.4);
  });

  it('bumps orders to the exchange minimum when config is lower', async () => {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'execution.enabled': true,
        'execution.allowMainnet': true,
        'hyperliquid.testnet': false,
        'capital.leverage': 5,
        'capital.leverageScore2': 5,
        'capital.leverageScore3': 5,
        'capital.leverageScore4': 5,
        'capital.minOrderNotional': 5,
        'capital.freeCollateralBufferUsd': 1,
        'hyperliquid.exchangeMinOrderNotional': 10,
        'exits.tp1ClosePercent': 50,
        'exits.tp2ClosePercent': 35,
        'exits.tp3ClosePercent': 15,
      };
      return values[key];
    });

    hl.placeMarketOrder.mockImplementation(() => Promise.resolve({
      status: 'filled',
      avgPx: 2,
      totalSz: 5,
    }));

    const result = await service.openPosition({
      token: 'POL',
      direction: 'long',
      score: 2,
      patternsFired: ['volume_spike'],
      currentPrice: 2,
      suggestedMargin: 1,
      notional: 5,
      leverage: 5,
      stopPrice: 1.8,
      tp1Price: 2.1,
      tp2Price: 2.2,
      marketCondition: 'sideways',
    });

    expect(hl.placeMarketOrder).toHaveBeenCalledWith('POL', true, 5);
    expect(result).not.toBeNull();
    expect(result?.margin).toBe(2);
    expect(result?.notional).toBe(10);
  });

  it('refuses to open positions when isolated leverage setup fails', async () => {
    hl.setLeverage.mockResolvedValue(false);

    const result = await service.openPosition({
      token: 'SOL',
      direction: 'long',
      score: 2,
      patternsFired: ['volume_spike'],
      currentPrice: 10,
      suggestedMargin: 10,
      notional: 30,
      leverage: 3,
      stopPrice: 9.3,
      tp1Price: 10.7,
      tp2Price: 11.4,
      marketCondition: 'sideways',
    });

    expect(result).toBeNull();
    expect(hl.setLeverage).toHaveBeenCalledWith('SOL', 3);
    expect(hl.placeMarketOrder).not.toHaveBeenCalled();
  });

  it('refuses to open positions on mainnet when second safety gate is off', async () => {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'execution.enabled': true,
        'execution.allowMainnet': false,
        'hyperliquid.testnet': false,
        'capital.leverage': 3,
        'capital.leverageScore2': 3,
        'capital.leverageScore3': 3,
        'capital.leverageScore4': 3,
        'capital.minOrderNotional': 10,
        'capital.freeCollateralBufferUsd': 1,
        'hyperliquid.exchangeMinOrderNotional': 10,
        'exits.tp1ClosePercent': 50,
        'exits.tp2ClosePercent': 35,
        'exits.tp3ClosePercent': 15,
      };
      return values[key];
    });

    const result = await service.openPosition({
      token: 'SOL',
      direction: 'long',
      score: 2,
      patternsFired: ['volume_spike'],
      currentPrice: 10,
      suggestedMargin: 10,
      notional: 30,
      leverage: 3,
      stopPrice: 9.3,
      tp1Price: 10.7,
      tp2Price: 11.4,
      marketCondition: 'sideways',
    });

    expect(result).toBeNull();
    expect(hl.setLeverage).not.toHaveBeenCalled();
    expect(hl.placeMarketOrder).not.toHaveBeenCalled();
  });

  it('refuses to close positions when execution is disabled', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'execution.enabled') return false;
      if (key === 'exits.stopLossPercent') return 7;
      if (key === 'capital.leverage') return 3;
      if (key === 'capital.freeCollateralBufferUsd') return 1;
      if (key === 'exits.tp1ClosePercent') return 50;
      if (key === 'exits.tp2ClosePercent') return 35;
      if (key === 'exits.tp3ClosePercent') return 15;
      return undefined;
    });

    const result = await service.closePosition(
      {
        id: '1',
        token: 'SOL',
        direction: 'long',
        entryPrice: 10,
        currentPrice: 10,
        margin: 10,
        notional: 30,
        leverage: 3,
        size: 3,
        unrealizedPnl: 0,
        realizedPnl: 0,
        tp1Hit: false,
        tp2Hit: false,
        stopPrice: 9.3,
        tp1Price: 10.7,
        tp2Price: 11.4,
        trailingHighest: 10,
        openTime: Date.now(),
        patternsFired: [],
        score: 2,
        marketCondition: 'sideways',
        tp1Size: 1.5,
        tp2Size: 1.05,
        tp3Size: 0.45,
      },
      1,
      'TP1',
    );

    expect(result).toBeNull();
    expect(hl.placeMarketOrder).not.toHaveBeenCalled();
  });

  it('refuses to close positions on mainnet when second safety gate is off', async () => {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'execution.enabled': true,
        'execution.allowMainnet': false,
        'hyperliquid.testnet': false,
        'capital.leverage': 3,
        'capital.leverageScore2': 3,
        'capital.leverageScore3': 3,
        'capital.leverageScore4': 3,
        'capital.minOrderNotional': 10,
        'capital.freeCollateralBufferUsd': 1,
        'hyperliquid.exchangeMinOrderNotional': 10,
        'exits.tp1ClosePercent': 50,
        'exits.tp2ClosePercent': 35,
        'exits.tp3ClosePercent': 15,
      };
      return values[key];
    });

    const result = await service.closePosition(
      {
        id: '1',
        token: 'SOL',
        direction: 'long',
        entryPrice: 10,
        currentPrice: 10,
        margin: 10,
        notional: 30,
        leverage: 3,
        size: 3,
        unrealizedPnl: 0,
        realizedPnl: 0,
        tp1Hit: false,
        tp2Hit: false,
        stopPrice: 9.3,
        tp1Price: 10.7,
        tp2Price: 11.4,
        trailingHighest: 10,
        openTime: Date.now(),
        patternsFired: [],
        score: 2,
        marketCondition: 'sideways',
        tp1Size: 1.5,
        tp2Size: 1.05,
        tp3Size: 0.45,
      },
      1,
      'TP1',
    );

    expect(result).toBeNull();
    expect(hl.placeMarketOrder).not.toHaveBeenCalled();
  });

  it('skips opening when exchange-reported free collateral is too low', async () => {
    hl.getAvailableCollateral.mockResolvedValue(3);

    const result = await service.openPosition({
      token: 'ASTER',
      direction: 'long',
      score: 2,
      patternsFired: ['volume_spike'],
      currentPrice: 1,
      suggestedMargin: 3,
      notional: 10,
      leverage: 2,
      stopPrice: 0.9,
      tp1Price: 1.1,
      tp2Price: 1.2,
      marketCondition: 'sideways',
    });

    expect(result).toBeNull();
    expect(hl.placeMarketOrder).not.toHaveBeenCalled();
  });

  it('uses signal leverage instead of the global leverage fallback', async () => {
    hl.placeMarketOrder.mockResolvedValue({
      status: 'filled',
      avgPx: 10,
      totalSz: 1,
    });

    const result = await service.openPosition({
      token: 'BONK',
      direction: 'long',
      score: 2,
      patternsFired: ['volume_spike'],
      currentPrice: 10,
      suggestedMargin: 10,
      notional: 10,
      leverage: 1,
      stopPrice: 9.5,
      tp1Price: 10.2,
      tp2Price: 10.4,
      marketCondition: 'sideways',
    });

    expect(result).not.toBeNull();
    expect(hl.setLeverage).toHaveBeenCalledWith('BONK', 1);
    expect(result?.leverage).toBe(1);
    expect(result?.margin).toBe(10);
  });
});
