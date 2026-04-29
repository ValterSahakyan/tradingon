import { AppDataSource } from './data-source';
import { AppSetting } from './entities/app-setting.entity';
import configuration from './configuration';
import { APP_SETTING_FIELDS, SettingField } from './app-settings.definitions';

function getValueByPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, source);
}

function serialize(field: SettingField, value: unknown): string {
  if (field.type === 'number') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(`Invalid number for ${field.key}`);
    }
    return String(numeric);
  }

  if (field.type === 'boolean') {
    return value === true || value === 'true' ? 'true' : 'false';
  }

  if (field.type === 'json') {
    return JSON.stringify(value);
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid string for ${field.key}`);
  }

  return value;
}

async function main() {
  const config = configuration() as Record<string, unknown>;

  await AppDataSource.initialize();

  try {
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const repo = AppDataSource.getRepository(AppSetting);
    let seeded = 0;

    for (const field of APP_SETTING_FIELDS) {
      const value = getValueByPath(config, field.path);
      if (value === undefined || value === null) {
        continue;
      }

      await repo.upsert({ key: field.key, value: serialize(field, value) }, ['key']);
      seeded += 1;
    }

    console.log(`Seeded ${seeded} app settings into the database.`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Failed to seed app settings:', error);
  process.exit(1);
});
