import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trade_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token VARCHAR(20) NOT NULL,
        direction VARCHAR(10) NOT NULL,
        "entryPrice" NUMERIC(18,8) NOT NULL,
        "exitPrice" NUMERIC(18,8),
        margin NUMERIC(10,4) NOT NULL,
        notional NUMERIC(10,4) NOT NULL,
        leverage INT NOT NULL,
        "patternsFired" TEXT NOT NULL,
        score INT NOT NULL,
        "entryTime" BIGINT NOT NULL,
        "exitTime" BIGINT,
        "durationMinutes" INT,
        "exitReason" VARCHAR(20),
        "pnlUsd" NUMERIC(10,4),
        "pnlPercent" NUMERIC(10,4),
        "fundingPaid" NUMERIC(10,6),
        "marketCondition" VARCHAR(20) NOT NULL,
        "fundingRateAtEntry" NUMERIC(10,4),
        "tp1Price" NUMERIC(18,8),
        "tp2Price" NUMERIC(18,8),
        "stopPrice" NUMERIC(18,8),
        "tp1Hit" BOOLEAN DEFAULT FALSE,
        "tp2Hit" BOOLEAN DEFAULT FALSE,
        "createdAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_trade_logs_token_entry ON trade_logs (token, "entryTime");
      CREATE INDEX IF NOT EXISTS idx_trade_logs_exit ON trade_logs ("exitTime");

      CREATE TABLE IF NOT EXISTS daily_stats (
        id SERIAL PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        "totalTrades" INT DEFAULT 0,
        wins INT DEFAULT 0,
        losses INT DEFAULT 0,
        "totalPnlUsd" NUMERIC(10,4) DEFAULT 0,
        "totalFundingPaid" NUMERIC(10,4) DEFAULT 0,
        "avgWinUsd" NUMERIC(10,4),
        "avgLossUsd" NUMERIC(10,4),
        "winRatePct" NUMERIC(5,2),
        "startingCapital" NUMERIC(10,4),
        "endingCapital" NUMERIC(10,4),
        "circuitBreakerTriggered" BOOLEAN DEFAULT FALSE,
        "circuitBreakerReason" TEXT
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS trade_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS daily_stats`);
  }
}
