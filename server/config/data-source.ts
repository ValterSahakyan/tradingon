import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { AppSetting } from './entities/app-setting.entity';
import { TradeLog } from '../logging/entities/trade-log.entity';
import { DailyStats } from '../logging/entities/daily-stats.entity';
import { envFilePath } from './paths';

dotenv.config({ path: envFilePath });

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [AppSetting, TradeLog, DailyStats],
  migrations: [resolve(__dirname, '..', 'migrations', '*.js')],
  synchronize: false,
});
