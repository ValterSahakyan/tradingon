import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import configuration from './config/configuration';
import { TradeLog } from './logging/entities/trade-log.entity';
import { DailyStats } from './logging/entities/daily-stats.entity';
import { BotModule } from './bot/bot.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    // Config — load .env and make available everywhere
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('database.url'),
        entities: [TradeLog, DailyStats],
        synchronize: true, // auto-create tables on first run; disable in prod and use migrations
        logging: false,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),

    // Scheduling (cron jobs)
    ScheduleModule.forRoot(),

    // Event emitter (WebSocket → PositionManager bridge)
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),

    // Serve dashboard static files
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      exclude: ['/api/(.*)'],
    }),

    // Feature modules
    BotModule,
    DashboardModule,
  ],
})
export class AppModule {}
