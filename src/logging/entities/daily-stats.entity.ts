import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('daily_stats')
@Index(['date'], { unique: true })
export class DailyStats {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string; // YYYY-MM-DD

  @Column('int', { default: 0 })
  totalTrades: number;

  @Column('int', { default: 0 })
  wins: number;

  @Column('int', { default: 0 })
  losses: number;

  @Column('decimal', { precision: 10, scale: 4, default: 0 })
  totalPnlUsd: number;

  @Column('decimal', { precision: 10, scale: 4, default: 0 })
  totalFundingPaid: number;

  @Column('decimal', { precision: 10, scale: 4, nullable: true })
  avgWinUsd: number;

  @Column('decimal', { precision: 10, scale: 4, nullable: true })
  avgLossUsd: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  winRatePct: number;

  @Column('decimal', { precision: 10, scale: 4, nullable: true })
  startingCapital: number;

  @Column('decimal', { precision: 10, scale: 4, nullable: true })
  endingCapital: number;

  @Column({ default: false })
  circuitBreakerTriggered: boolean;

  @Column({ nullable: true })
  circuitBreakerReason: string;
}
