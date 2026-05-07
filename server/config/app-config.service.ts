import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppSetting } from './entities/app-setting.entity';
import {
  APP_SETTING_FIELDS,
  APP_SETTING_FIELD_BY_KEY,
  APP_SETTING_FIELD_BY_PATH,
  SettingField,
  SettingFieldType,
} from './app-settings.definitions';

@Injectable()
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name);
  private readonly values = new Map<string, string>();
  private ready = false;
  private initError: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(AppSetting)
    private readonly settingsRepo: Repository<AppSetting>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async waitUntilReady(): Promise<void> {
    await this.initialize();
  }

  get<T = unknown>(path: string): T {
    const field = APP_SETTING_FIELD_BY_PATH.get(path);
    if (field) {
      const raw = this.values.get(field.key);
      if (raw != null) {
        return this.parseValue(field.type, raw) as T;
      }

      const fallbackValue = this.getRuntimeFallbackValue(field);
      if (fallbackValue !== undefined) {
        return fallbackValue as T;
      }

      if (field.editable) {
        if (this.ready) {
          throw new Error(`Missing DB-backed setting value for ${field.key} (${field.path})`);
        }

        // During bootstrap, fall back to the base config only until DB-backed values are loaded.
        return this.config.get<T>(path);
      }
    }

    return this.config.get<T>(path);
  }

  async updateSettings(values: Record<string, unknown>): Promise<string[]> {
    await this.waitUntilReady();
    await this.ensureSchema();
    const updatedKeys: string[] = [];
    const pendingValues = new Map<string, string>();

    for (const [key, rawValue] of Object.entries(values)) {
      const field = APP_SETTING_FIELD_BY_KEY.get(key);
      if (!field || !field.editable) {
        continue;
      }
      if (field.secret && rawValue === '') {
        continue;
      }

      const value = this.serializeValue(field, rawValue);
      pendingValues.set(field.key, value);
    }

    for (const [key, value] of pendingValues.entries()) {
      this.validateSettingValue(key, value, pendingValues);
    }

    for (const [key, value] of pendingValues.entries()) {
      const field = APP_SETTING_FIELD_BY_KEY.get(key);
      if (!field) {
        continue;
      }

      await this.settingsRepo.upsert({ key: field.key, value }, ['key']);
      this.values.set(field.key, value);
      updatedKeys.push(field.key);
    }

    return updatedKeys;
  }

  getSettingFields(): SettingField[] {
    return APP_SETTING_FIELDS;
  }

  isReady(): boolean {
    return this.ready;
  }

  getInitError(): string | null {
    return this.initError;
  }

  getLiveTradingReadiness(): string[] {
    const issues: string[] = [];
    const live = this.get<boolean>('execution.enabled');
    if (!live) {
      return issues;
    }
    const isTestnet = this.get<boolean>('hyperliquid.testnet');

    const requiredBoolean = (path: string, label: string) => {
      const value = this.get<boolean>(path);
      if (typeof value !== 'boolean') {
        issues.push(`${label} is missing`);
      }
    };
    const requiredPositive = (path: string, label: string) => {
      const value = Number(this.get<number>(path) ?? 0);
      if (!Number.isFinite(value) || value <= 0) {
        issues.push(`${label} must be > 0`);
      }
    };
    const requiredString = (path: string, label: string) => {
      const value = String(this.get<string>(path) ?? '').trim();
      if (!value) {
        issues.push(`${label} is missing`);
      }
    };

    if (!isTestnet && this.get<boolean>('execution.allowMainnet') !== true) {
      issues.push('Allow Mainnet Trading must be enabled for live mainnet execution');
    }
    requiredString('hyperliquid.privateKey', 'API Wallet Private Key');
    requiredString('hyperliquid.accountAddress', 'Main Account Address');
    requiredString('hyperliquid.apiUrl', 'Hyperliquid API URL');
    requiredString('hyperliquid.wsUrl', 'Hyperliquid WebSocket URL');
    requiredPositive('risk.dailyLossLimit', 'Daily Loss Limit');
    requiredPositive('risk.weeklyLossLimit', 'Weekly Loss Limit');
    requiredPositive('risk.emergencyCapitalFloor', 'Emergency Capital Floor');
    requiredPositive('capital.maxConcurrentPositions', 'Max Concurrent Positions');
    requiredPositive('capital.marginScore2', 'Margin For Score 2');
    requiredPositive('capital.marginScore3', 'Margin For Score 3');
    requiredPositive('capital.marginScore4', 'Margin For Score 4');
    requiredPositive('hyperliquid.maxEntrySpreadBps', 'Max Entry Spread Bps');
    requiredPositive('hyperliquid.maxEntrySlippageBps', 'Max Entry Slippage Bps');
    requiredPositive('filters.minDayVolume', 'Min Day Volume');
    requiredPositive('filters.minOpenInterest', 'Min Open Interest');
    requiredPositive('exits.stopLossPercent', 'Stop Loss %');
    requiredPositive('exits.maxHoldHours', 'Max Hold Hours');

    return issues;
  }

  private async initialize(): Promise<void> {
    if (this.ready) {
      return;
    }

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.runInitialization();
    await this.initPromise;
  }

  private async runInitialization(): Promise<void> {
    try {
      await this.ensureSchema();
      await this.loadValues();
      await this.seedMissingValues();
      await this.loadValues();
      this.assertEditableSettingsPresent();
    } catch (err) {
      this.initError = err.message;
      this.logger.error(`Failed to initialize app settings: ${err.message}`);
    } finally {
      this.ready = true;
      this.initPromise = null;
    }
  }

  private async loadValues(): Promise<void> {
    const settings = await this.settingsRepo.find();
    this.values.clear();
    for (const setting of settings) {
      this.values.set(setting.key, setting.value);
    }
  }

  private async seedMissingValues(): Promise<void> {
    for (const field of APP_SETTING_FIELDS) {
      if (this.values.has(field.key)) {
        continue;
      }

      const baseValue = this.getSeedValue(field);
      if (baseValue === undefined || baseValue === null) {
        continue;
      }

      await this.settingsRepo.upsert(
        { key: field.key, value: this.serializeValue(field, baseValue) },
        ['key'],
      );
    }
  }

  private async ensureSchema(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private assertEditableSettingsPresent(): void {
    const missing = APP_SETTING_FIELDS
      .filter((field) => field.editable && !this.values.has(field.key))
      .map((field) => `${field.key} (${field.path})`);

    if (missing.length) {
      throw new Error(`Missing DB-backed app settings: ${missing.join(', ')}`);
    }
  }

  private parseValue(type: SettingFieldType, raw: string): unknown {
    if (type === 'number') {
      const value = Number(raw);
      return Number.isFinite(value) ? value : 0;
    }

    if (type === 'boolean') {
      return raw === 'true';
    }

    if (type === 'json') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    return raw;
  }

  private serializeValue(field: SettingField, rawValue: unknown): string {
    if (field.type === 'number') {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        throw new BadRequestException(`Invalid number for ${field.key}`);
      }
      return String(value);
    }

    if (field.type === 'boolean') {
      if (rawValue === true || rawValue === 'true') {
        return 'true';
      }
      if (rawValue === false || rawValue === 'false') {
        return 'false';
      }
      throw new BadRequestException(`Invalid boolean for ${field.key}`);
    }

    if (field.type === 'json') {
      if (typeof rawValue !== 'string') {
        return JSON.stringify(rawValue);
      }

      try {
        return JSON.stringify(JSON.parse(rawValue));
      } catch {
        throw new BadRequestException(`Invalid JSON for ${field.key}`);
      }
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException(`Invalid string for ${field.key}`);
    }

    return rawValue;
  }

  private validateSettingValue(key: string, value: string, pendingValues?: Map<string, string>): void {
    if (key === 'hyperliquidPrivateKey') {
      if (!/^0x[a-fA-F0-9]{64}$/.test(value.trim())) {
        throw new BadRequestException(
          'API Wallet Private Key must be a real 0x-prefixed 64-byte hex private key, not a wallet address',
        );
      }
      return;
    }

    if (key === 'hyperliquidAccountAddress') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(value.trim())) {
        throw new BadRequestException('Main Account Address must be a valid 0x-prefixed wallet address');
      }
      return;
    }

    if (key === 'hyperliquidMarketOrderSlippage') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 0.1) {
        throw new BadRequestException('Market Order Slippage must be > 0 and <= 0.1');
      }
      return;
    }

    if (key === 'hyperliquidMinOrderBufferPercent') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 20) {
        throw new BadRequestException('Min Order Buffer % must be between 0 and 20');
      }
      return;
    }

    if (key === 'hyperliquidExchangeMinOrderNotional') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1000) {
        throw new BadRequestException('Exchange Min Order Notional must be greater than 0 and less than or equal to 1000');
      }
      return;
    }

    if (key === 'hyperliquidMaxEntrySpreadBps' || key === 'hyperliquidMaxEntrySlippageBps') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 500) {
        throw new BadRequestException('Hyperliquid entry spread/slippage thresholds must be greater than 0 and less than or equal to 500 bps');
      }
      return;
    }

    if (key === 'leverage') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 1) {
        throw new BadRequestException('Leverage must be greater than or equal to 1');
      }
      return;
    }

    if (key === 'leverageScore2' || key === 'leverageScore3' || key === 'leverageScore4') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 1) {
        throw new BadRequestException('Score leverage must be greater than or equal to 1');
      }
      return;
    }

    if (key === 'freeCollateralBufferUsd') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1000) {
        throw new BadRequestException('Free Collateral Buffer USD must be between 0 and 1000');
      }
      return;
    }

    if (key === 'minDayVolume' || key === 'minOpenInterest') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) {
        throw new BadRequestException('Liquidity filters must be greater than or equal to 0');
      }
      return;
    }

    if (key === 'tp1ClosePercent' || key === 'tp2ClosePercent' || key === 'tp3ClosePercent') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
        throw new BadRequestException('TP close percentages must be between 0 and 100');
      }
      const getPercent = (fieldKey: 'tp1ClosePercent' | 'tp2ClosePercent' | 'tp3ClosePercent'): number => {
        if (fieldKey === key) {
          return numeric;
        }

        const pending = pendingValues?.get(fieldKey);
        if (pending != null) {
          return Number(pending);
        }

        const stored = this.values.get(fieldKey);
        if (stored != null) {
          return Number(stored);
        }

        return Number(this.config.get<number>(`exits.${fieldKey}`) ?? 0);
      };

      const tp1 = getPercent('tp1ClosePercent');
      const tp2 = getPercent('tp2ClosePercent');
      const tp3 = getPercent('tp3ClosePercent');
      const total = tp1 + tp2 + tp3;
      if (Math.abs(total - 100) > 0.0001) {
        throw new BadRequestException('TP1 Close %, TP2 Close %, and TP3 Close % must add up to 100');
      }
    }
  }

  private getSeedValue(field: SettingField): unknown {
    const runtimeFallback = this.getRuntimeFallbackValue(field);
    if (runtimeFallback !== undefined) {
      return runtimeFallback;
    }

    return this.config.get(field.path);
  }

  private getRuntimeFallbackValue(field: SettingField): unknown {
    if (field.key === 'leverageScore2' || field.key === 'leverageScore3' || field.key === 'leverageScore4') {
      const leverageFromDb = this.values.get('leverage');
      if (leverageFromDb != null) {
        return this.parseValue('number', leverageFromDb);
      }

      const leverageFromConfig = this.config.get<number>('capital.leverage');
      if (Number.isFinite(leverageFromConfig) && leverageFromConfig >= 1) {
        return leverageFromConfig;
      }
    }

    return undefined;
  }
}
