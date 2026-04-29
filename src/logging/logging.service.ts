import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradeLog } from './entities/trade-log.entity';
import { DailyStats } from './entities/daily-stats.entity';
import { ExitReason, MarketCondition, OpenPosition, TradeSignal } from '../common/types';

@Injectable()
export class LoggingService {
  private readonly logger = new Logger(LoggingService.name);

  constructor(
    @InjectRepository(TradeLog)
    private readonly tradeRepo: Repository<TradeLog>,
    @InjectRepository(DailyStats)
    private readonly statsRepo: Repository<DailyStats>,
  ) {}

  async logTradeOpen(signal: TradeSignal, position: OpenPosition): Promise<string> {
    const tp1Price =
      signal.direction === 'long'
        ? signal.currentPrice * 1.1
        : signal.currentPrice * 0.9;
    const tp2Price =
      signal.direction === 'long'
        ? signal.currentPrice * 1.2
        : signal.currentPrice * 0.8;
    const stopPrice =
      signal.direction === 'long'
        ? signal.currentPrice * 0.93
        : signal.currentPrice * 1.07;

    const log = this.tradeRepo.create({
      token: signal.token,
      direction: signal.direction,
      entryPrice: signal.currentPrice,
      margin: signal.suggestedMargin,
      notional: signal.notional,
      leverage: 3,
      patternsFired: signal.patternsFired,
      score: signal.score,
      entryTime: Date.now(),
      marketCondition: signal.marketCondition,
      tp1Price,
      tp2Price,
      stopPrice,
      tp1Hit: false,
      tp2Hit: false,
      fundingRateAtEntry: 0,
    });

    const saved = await this.tradeRepo.save(log);
    this.logger.log(`Trade opened: ${signal.token} ${signal.direction} @ ${signal.currentPrice}`);
    return saved.id;
  }

  async logTradeClose(
    tradeId: string,
    exitPrice: number,
    exitReason: ExitReason,
    pnlUsd: number,
    fundingPaid = 0,
    tp1Hit = false,
    tp2Hit = false,
  ): Promise<void> {
    const trade = await this.tradeRepo.findOne({ where: { id: tradeId } });
    if (!trade) {
      this.logger.warn(`Trade ${tradeId} not found for close log`);
      return;
    }

    const exitTime = Date.now();
    const durationMinutes = Math.round((exitTime - Number(trade.entryTime)) / 60_000);
    const pnlPercent = (pnlUsd / trade.notional) * 100;

    await this.tradeRepo.update(tradeId, {
      exitPrice,
      exitTime,
      durationMinutes,
      exitReason,
      pnlUsd,
      pnlPercent,
      fundingPaid,
      tp1Hit,
      tp2Hit,
    });

    await this.updateDailyStats(pnlUsd, fundingPaid);
    this.logger.log(
      `Trade closed: ${trade.token} ${trade.direction} — ${exitReason} PnL: $${pnlUsd.toFixed(2)}`,
    );
  }

  async getTodayPnl(): Promise<number> {
    const today = this.todayDateStr();
    const stats = await this.statsRepo.findOne({ where: { date: today } });
    return stats?.totalPnlUsd ?? 0;
  }

  async getWeekPnl(): Promise<number> {
    const result = await this.tradeRepo
      .createQueryBuilder('t')
      .select('SUM(t.pnlUsd)', 'total')
      .where('t.exitTime >= :cutoff', { cutoff: Date.now() - 7 * 86400_000 })
      .andWhere('t.exitTime IS NOT NULL')
      .getRawOne();
    return parseFloat(result?.total ?? '0');
  }

  async getRecentLosses(windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    const count = await this.tradeRepo
      .createQueryBuilder('t')
      .where('t.exitTime >= :cutoff', { cutoff })
      .andWhere('t.pnlUsd < 0')
      .getCount();
    return count;
  }

  async getConsecutiveLosses(): Promise<number> {
    const recent = await this.tradeRepo.find({
      where: { exitTime: undefined },
      order: { exitTime: 'DESC' },
      take: 10,
    });

    const closed = recent.filter((t) => t.exitTime != null);
    let consecutive = 0;
    for (const t of closed) {
      if (t.pnlUsd < 0) consecutive++;
      else break;
    }
    return consecutive;
  }

  async getDailyStats(date?: string): Promise<DailyStats | null> {
    return this.statsRepo.findOne({ where: { date: date ?? this.todayDateStr() } });
  }

  async markCircuitBreaker(reason: string): Promise<void> {
    const today = this.todayDateStr();
    await this.statsRepo.upsert(
      { date: today, circuitBreakerTriggered: true, circuitBreakerReason: reason },
      ['date'],
    );
    this.logger.warn(`Circuit breaker triggered: ${reason}`);
  }

  async generateDailySummary(): Promise<string> {
    const today = this.todayDateStr();
    const stats = await this.getDailyStats(today);
    if (!stats) return `No trades today (${today})`;

    const winRate = stats.totalTrades > 0 ? ((stats.wins / stats.totalTrades) * 100).toFixed(1) : '0.0';
    return (
      `📊 Daily Summary ${today}\n` +
      `Trades: ${stats.totalTrades} | W: ${stats.wins} L: ${stats.losses} | WR: ${winRate}%\n` +
      `PnL: $${stats.totalPnlUsd?.toFixed(2)} | Funding: -$${stats.totalFundingPaid?.toFixed(4)}\n` +
      `Avg Win: $${stats.avgWinUsd?.toFixed(2)} | Avg Loss: $${stats.avgLossUsd?.toFixed(2)}\n` +
      `Capital: $${stats.startingCapital} → $${stats.endingCapital}` +
      (stats.circuitBreakerTriggered ? `\n⚠️ Circuit breaker: ${stats.circuitBreakerReason}` : '')
    );
  }

  // ─── Internal ──────────────────────────────────────────────────

  private async updateDailyStats(pnlUsd: number, fundingPaid: number): Promise<void> {
    const today = this.todayDateStr();
    let stats = await this.statsRepo.findOne({ where: { date: today } });

    if (!stats) {
      stats = this.statsRepo.create({ date: today, totalTrades: 0, wins: 0, losses: 0, totalPnlUsd: 0, totalFundingPaid: 0 });
    }

    stats.totalTrades += 1;
    stats.totalPnlUsd = +(+(stats.totalPnlUsd ?? 0) + pnlUsd).toFixed(4);
    stats.totalFundingPaid = +(+(stats.totalFundingPaid ?? 0) + fundingPaid).toFixed(6);

    if (pnlUsd >= 0) stats.wins += 1;
    else stats.losses += 1;

    // Recompute averages
    const allToday = await this.tradeRepo
      .createQueryBuilder('t')
      .where('t.exitTime >= :cutoff', { cutoff: new Date(today).getTime() })
      .andWhere('t.pnlUsd IS NOT NULL')
      .getMany();

    const wins = allToday.filter((t) => t.pnlUsd >= 0);
    const losses = allToday.filter((t) => t.pnlUsd < 0);
    stats.avgWinUsd = wins.length > 0 ? +(wins.reduce((s, t) => s + +t.pnlUsd, 0) / wins.length).toFixed(4) : 0;
    stats.avgLossUsd = losses.length > 0 ? +(losses.reduce((s, t) => s + +t.pnlUsd, 0) / losses.length).toFixed(4) : 0;
    stats.winRatePct = stats.totalTrades > 0 ? +((stats.wins / stats.totalTrades) * 100).toFixed(2) : 0;

    await this.statsRepo.save(stats);
  }

  private todayDateStr(): string {
    return new Date().toISOString().split('T')[0];
  }
}
