import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppConfigService } from '../config/app-config.service';
import { LoggingService } from '../logging/logging.service';
import { RiskService } from './risk.service';

describe('RiskService', () => {
  let config: { get: any };
  let logging: any;
  let service: RiskService;

  beforeEach(() => {
    config = {
      get: (jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'risk.dailyLossLimit': 20,
          'risk.weeklyLossLimit': 40,
          'risk.consecutiveLossPause2h': 3,
          'risk.consecutiveLossPauseDay': 5,
          'risk.emergencyCapitalFloor': 150,
        };
        return values[key];
      }) as any),
    };

    logging = {
      getTodayPnl: (jest.fn(() => Promise.resolve(0)) as any),
      getWeekPnl: (jest.fn(() => Promise.resolve(0)) as any),
      getConsecutiveLosses: (jest.fn(() => Promise.resolve(0)) as any),
      markCircuitBreaker: (jest.fn(() => Promise.resolve(undefined)) as any),
    };

    service = new RiskService(config as unknown as AppConfigService, logging as unknown as LoggingService);
  });

  it('enters paused_daily_limit when daily pnl breaches the limit', async () => {
    logging.getTodayPnl.mockResolvedValue(-25);

    const result = await service.canTrade();

    expect(result).toEqual({ allowed: false, reason: 'daily_loss_limit' });
    expect(service.getSnapshot().state).toBe('paused_daily_limit');
    expect(logging.markCircuitBreaker).toHaveBeenCalled();
  });

  it('pauses for consecutive losses without overwriting to daily state', async () => {
    logging.getConsecutiveLosses.mockResolvedValue(5);

    const result = await service.canTrade();

    expect(result).toEqual({ allowed: false, reason: 'consecutive_loss_pause_day' });
    expect(service.getSnapshot().state).toBe('paused_consecutive_loss');
  });
});
