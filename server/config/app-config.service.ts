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
    }

    return this.config.get<T>(path);
  }

  async updateSettings(values: Record<string, unknown>): Promise<string[]> {
    await this.waitUntilReady();
    await this.ensureSchema();
    const updatedKeys: string[] = [];

    for (const [key, rawValue] of Object.entries(values)) {
      const field = APP_SETTING_FIELD_BY_KEY.get(key);
      if (!field || !field.editable) {
        continue;
      }
      if (field.secret && rawValue === '') {
        continue;
      }

      const value = this.serializeValue(field, rawValue);
      this.validateSettingValue(field.key, value);
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

      const baseValue = this.config.get(field.path);
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

  private validateSettingValue(key: string, value: string): void {
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
    }
  }
}
