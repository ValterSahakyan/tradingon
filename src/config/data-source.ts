import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { TradeLog } from '../logging/entities/trade-log.entity';
import { DailyStats } from '../logging/entities/daily-stats.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [TradeLog, DailyStats],
  migrations: ['dist/migrations/*.js'],
  synchronize: false,
});
