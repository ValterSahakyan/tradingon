import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppConfigService } from '../config/app-config.service';

@Controller('api/health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  getHealth() {
    const configError = this.config.getInitError();
    const configReady = this.config.isReady() && !configError;
    return {
      status: this.dataSource.isInitialized && configReady ? 'ok' : 'degraded',
      timestamp: Date.now(),
      services: {
        database: this.dataSource.isInitialized ? 'up' : 'down',
        config: configReady ? 'ready' : this.config.isReady() ? 'error' : 'loading',
      },
      configError,
    };
  }
}
