import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('trade_logs')
@Index(['token', 'entryTime'])
@Index(['exitTime'])
export class TradeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20 })
  token: string;

  @Column({ length: 10 })
  direction: string; // 'long' | 'short'

  @Column('decimal', { precision: 18, scale: 8 })
  entryPrice: number;

  @Column('decimal', { precision: 18, scale: 8, nullable: true })
  exitPrice: number;

  @Column('decimal', { precision: 10, scale: 4 })
  margin: number;

  @Column('decimal', { precision: 10, scale: 4 })
  notional: number;

  @Column('int')
  leverage: number;

  @Column('simple-array')
  patternsFired: string[];

  @Column('int')
  score: number;

  @Column('bigint')
  entryTime: number; // unix ms

  @Column('bigint', { nullable: true })
  exitTime: number;

  @Column('int', { nullable: true })
  durationMinutes: number;

  @Column({ length: 20, nullable: true })
  exitReason: string;

  @Column('decimal', { precision: 10, scale: 4, nullable: true })
  pnlUsd: number;

  @Column('decimal', { precision: 10, scale: 4, nullable: true })
  pnlPercent: number;

  @Column('decimal', { precision: 10, scale: 6, nullable: true })
  fundingPaid: number;

  @Column({ length: 20 })
  marketCondition: string;

  @Column('decimal', { precision: 10, scale: 4, nullable: true })
  fundingRateAtEntry: number;

  @Column('decimal', { precision: 18, scale: 8, nullable: true })
  tp1Price: number;

  @Column('decimal', { precision: 18, scale: 8, nullable: true })
  tp2Price: number;

  @Column('decimal', { precision: 18, scale: 8, nullable: true })
  stopPrice: number;

  @Column({ default: false })
  tp1Hit: boolean;

  @Column({ default: false })
  tp2Hit: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
