import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { config as loadDotenv } from 'dotenv';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { envFilePath } from './config/paths';
import { validateRuntimeEnv } from './config/runtime-validation';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  loadDotenv({ path: envFilePath });
  validateRuntimeEnv();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (corsOrigin) {
    app.enableCors({
      origin: corsOrigin.split(',').map((value) => value.trim()).filter(Boolean),
      credentials: true,
    });
  }

  app.enableShutdownHooks();
  const configService = app.get(ConfigService);
  const port = configService.get<number>('server.port') || 3000;
  logger.log(`Starting HTTP listener on port ${port}`);
  await app.listen(port, '0.0.0.0');
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
