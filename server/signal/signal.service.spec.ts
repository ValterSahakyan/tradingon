import { SignalService } from './signal.service';
import { AppConfigService } from '../config/app-config.service';

describe('SignalService', () => {
  it('deduplicates tracked tokens before evaluation and stored candidates', async () => {
    const config = {} as AppConfigService;
    const marketData = {
      getTrackedTokens: jest.fn(() => ['CHILLGUY', 'CHILLGUY', 'TAO']),
      getMarketCondition: jest.fn(() => 'sideways'),
    };
    const emitter = { emit: jest.fn() };

    const service = new SignalService(
      config,
      marketData as any,
      emitter as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

    service.evaluateToken = jest.fn(async (token: string) => ({
      signal: null,
      candidate: {
        token,
        direction: 'long',
        score: 2,
        currentPrice: 1,
        patternsFired: ['accumulation_breakout', 'volume_spike'],
        tradable: true,
        reason: null,
        marketCondition: 'sideways',
        fundingRate: 0,
        marketCap: 1_000_000,
        tokenAgeDays: 30,
        timestamp: token === 'CHILLGUY' ? 1000 : 2000,
      },
    }));

    await service.scanAll(new Set<string>());

    expect(service.evaluateToken).toHaveBeenCalledTimes(2);
    expect(service.getLastCandidates()).toHaveLength(2);
    expect(service.getLastCandidates().map((candidate: { token: string }) => candidate.token)).toEqual(['TAO', 'CHILLGUY']);
  });

  it('uses score-based leverage with fallback to the default leverage', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'capital.leverage': 3,
          'capital.leverageScore2': 1,
          'capital.leverageScore3': 2,
          'capital.leverageScore4': undefined,
        };
        return values[key];
      }),
    } as unknown as AppConfigService;

    const service = new SignalService(
      config,
      {} as any,
      { emit: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect((service as any).leverageForScore(2)).toBe(1);
    expect((service as any).leverageForScore(3)).toBe(2);
    expect((service as any).leverageForScore(4)).toBe(3);
  });
});
