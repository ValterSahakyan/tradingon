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
    return {
      status: this.dataSource.isInitialized && this.config.isReady() ? 'ok' : 'degraded',
      timestamp: Date.now(),
      services: {
        database: this.dataSource.isInitialized ? 'up' : 'down',
        config: this.config.isReady() ? 'ready' : 'loading',
      },
      configError: this.config.getInitError(),
    };
  }
}
