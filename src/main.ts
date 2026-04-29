import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { ConfigService } from '@nestjs/config';
import { validateRuntimeEnv } from './config/runtime-validation';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  validateRuntimeEnv();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  app.enableShutdownHooks();
  const configService = app.get(ConfigService);
  const port = configService.get<number>('server.port') || 3000;
  logger.log(`Starting HTTP listener on port ${port}`);
  await app.listen(port);
  logger.log(`HTTP listener bound on port ${port}`);

  const appConfig = app.get(AppConfigService);
  await appConfig.waitUntilReady();

  logger.log(`Trading bot running on port ${port}`);
  logger.log(`Mode: ${appConfig.get<boolean>('hyperliquid.testnet') ? 'TESTNET' : 'MAINNET'}`);
  logger.log(`Live trading: ${appConfig.get<boolean>('execution.enabled') ? 'ENABLED' : 'DISABLED'}`);
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
