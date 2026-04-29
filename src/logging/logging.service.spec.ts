import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppConfigService } from '../config/app-config.service';
import { LoggingService } from './logging.service';

describe('LoggingService', () => {
  let config: { get: any };
  let tradeRepo: any;
  let statsRepo: any;
  let service: LoggingService;

  beforeEach(() => {
    config = {
      get: (jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'exits.tp1Percent': 10,
          'exits.tp2Percent': 20,
        };
        return values[key];
      }) as any),
    };

    tradeRepo = {
      createQueryBuilder: jest.fn() as any,
      findOne: jest.fn() as any,
      save: jest.fn() as any,
      update: jest.fn() as any,
    };

    statsRepo = {
      findOne: jest.fn() as any,
      upsert: jest.fn() as any,
      save: jest.fn() as any,
      create: (jest.fn((value) => value) as any),
    };

    service = new LoggingService(config as unknown as AppConfigService, tradeRepo as any, statsRepo as any);
  });

  it('counts consecutive closed losing trades from most recent backward', async () => {
    const qb = {
      where: (jest.fn().mockReturnThis() as any),
      orderBy: (jest.fn().mockReturnThis() as any),
      limit: (jest.fn().mockReturnThis() as any),
      getMany: (jest.fn(() => Promise.resolve([
        { pnlUsd: '-5.2', exitTime: 3 },
        { pnlUsd: '-1.0', exitTime: 2 },
        { pnlUsd: '2.5', exitTime: 1 },
      ])) as any),
    };
    tradeRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getConsecutiveLosses();

    expect(result).toBe(2);
  });

  it('generates daily summary from decimal-like string values', async () => {
    statsRepo.findOne.mockResolvedValue({
      date: '2026-04-29',
      totalTrades: 4,
      wins: 3,
      losses: 1,
      totalPnlUsd: '12.3456',
      totalFundingPaid: '0.1234',
      avgWinUsd: '5.1000',
      avgLossUsd: '-3.0000',
      circuitBreakerTriggered: true,
      circuitBreakerReason: 'daily_loss_limit',
      startingCapital: '200',
      endingCapital: '212.3456',
    });

    const summary = await service.generateDailySummary();

    expect(summary).toContain('Daily Summary 2026-04-29');
    expect(summary).toContain('WR: 75.0%');
    expect(summary).toContain('PnL: $12.35');
    expect(summary).toContain('Circuit breaker: daily_loss_limit');
  });
});
