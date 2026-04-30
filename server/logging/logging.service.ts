import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradeLog } from './entities/trade-log.entity';
import { DailyStats } from './entities/daily-stats.entity';
import { ExitReason, OpenPosition, TradeSignal } from '../common/types';

@Injectable()
export class LoggingService {
  private readonly logger = new Logger(LoggingService.name);

  constructor(
    private readonly config: AppConfigService,
    @InjectRepository(TradeLog)
    private readonly tradeRepo: Repository<TradeLog>,
    @InjectRepository(DailyStats)
    private readonly statsRepo: Repository<DailyStats>,
  ) {}

  async logTradeOpen(_signal: TradeSignal, position: OpenPosition): Promise<string> {
    const log = this.tradeRepo.create({
      token: position.token,
      direction: position.direction,
      entryPrice: position.entryPrice,
      margin: position.margin,
      notional: position.notional,
      leverage: position.leverage,
      patternsFired: position.patternsFired,
      score: position.score,
      entryTime: position.openTime,
      marketCondition: position.marketCondition,
      tp1Price: position.tp1Price,
      tp2Price: position.tp2Price,
      stopPrice: position.stopPrice,
      tp1Hit: false,
      tp2Hit: false,
      fundingRateAtEntry: 0,
    });

    const saved = await this.tradeRepo.save(log);
    this.logger.log(`Trade opened: ${position.token} ${position.direction} @ ${position.entryPrice}`);
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
    const tradeNotional = this.toNumber(trade.notional);
    const pnlPercent = tradeNotional > 0 ? (pnlUsd / tradeNotional) * 100 : 0;

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
    this.logger.log(`Trade closed: ${trade.token} ${trade.direction} - ${exitReason} PnL: $${pnlUsd.toFixed(2)}`);
  }

  async getTodayPnl(): Promise<number> {
    const today = this.todayDateStr();
    const stats = await this.statsRepo.findOne({ where: { date: today } });
    return this.toNumber(stats?.totalPnlUsd);
  }

  async getWeekPnl(): Promise<number> {
    const result = await this.tradeRepo
      .createQueryBuilder('t')
      .select('SUM(t.pnlUsd)', 'total')
      .where('t.exitTime >= :cutoff', { cutoff: Date.now() - 7 * 86400_000 })
      .andWhere('t.exitTime IS NOT NULL')
      .getRawOne();
    return this.toNumber(result?.total);
  }

  async getRecentLosses(windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    return this.tradeRepo
      .createQueryBuilder('t')
      .where('t.exitTime >= :cutoff', { cutoff })
      .andWhere('t.pnlUsd < 0')
      .getCount();
  }

  async getConsecutiveLosses(): Promise<number> {
    const recent = await this.tradeRepo
      .createQueryBuilder('t')
      .where('t.exitTime IS NOT NULL')
      .orderBy('t.exitTime', 'DESC')
      .limit(10)
      .getMany();

    let consecutive = 0;
    for (const trade of recent) {
      if (this.toNumber(trade.pnlUsd) < 0) {
        consecutive += 1;
      } else {
        break;
      }
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
    if (!stats) {
      return `No trades today (${today})`;
    }

    const summaryDate = stats.date ?? today;

    const totalPnlUsd = this.toNumber(stats.totalPnlUsd);
    const totalFundingPaid = this.toNumber(stats.totalFundingPaid);
    const avgWinUsd = this.toNumber(stats.avgWinUsd);
    const avgLossUsd = this.toNumber(stats.avgLossUsd);
    const winRate = stats.totalTrades > 0 ? ((stats.wins / stats.totalTrades) * 100).toFixed(1) : '0.0';

    const lines = [
      `Daily Summary ${summaryDate}`,
      `Trades: ${stats.totalTrades} | W: ${stats.wins} L: ${stats.losses} | WR: ${winRate}%`,
      `PnL: $${totalPnlUsd.toFixed(2)} | Funding: -$${totalFundingPaid.toFixed(4)}`,
      `Avg Win: $${avgWinUsd.toFixed(2)} | Avg Loss: $${avgLossUsd.toFixed(2)}`,
    ];

    if (stats.startingCapital != null || stats.endingCapital != null) {
      lines.push(`Capital: $${this.toNumber(stats.startingCapital)} -> $${this.toNumber(stats.endingCapital)}`);
    }

    if (stats.circuitBreakerTriggered) {
      lines.push(`Circuit breaker: ${stats.circuitBreakerReason}`);
    }

    return lines.join('\n');
  }

  private async updateDailyStats(pnlUsd: number, fundingPaid: number): Promise<void> {
    const today = this.todayDateStr();
    let stats = await this.statsRepo.findOne({ where: { date: today } });

    if (!stats) {
      stats = this.statsRepo.create({
        date: today,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        totalPnlUsd: 0,
        totalFundingPaid: 0,
      });
    }

    stats.totalTrades += 1;
    stats.totalPnlUsd = +(this.toNumber(stats.totalPnlUsd) + pnlUsd).toFixed(4);
    stats.totalFundingPaid = +(this.toNumber(stats.totalFundingPaid) + fundingPaid).toFixed(6);

    if (pnlUsd >= 0) {
      stats.wins += 1;
    } else {
      stats.losses += 1;
    }

    const allToday = await this.tradeRepo
      .createQueryBuilder('t')
      .where('t.exitTime >= :cutoff', { cutoff: new Date(today).getTime() })
      .andWhere('t.pnlUsd IS NOT NULL')
      .getMany();

    const wins = allToday.filter((trade) => this.toNumber(trade.pnlUsd) >= 0);
    const losses = allToday.filter((trade) => this.toNumber(trade.pnlUsd) < 0);

    stats.avgWinUsd =
      wins.length > 0
        ? +(wins.reduce((sum, trade) => sum + this.toNumber(trade.pnlUsd), 0) / wins.length).toFixed(4)
        : 0;
    stats.avgLossUsd =
      losses.length > 0
        ? +(losses.reduce((sum, trade) => sum + this.toNumber(trade.pnlUsd), 0) / losses.length).toFixed(4)
        : 0;
    stats.winRatePct = stats.totalTrades > 0 ? +((stats.wins / stats.totalTrades) * 100).toFixed(2) : 0;

    await this.statsRepo.save(stats);
  }

  private todayDateStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  private toNumber(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }
}
