import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppSettings1800000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_app_settings_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."updatedAt" = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON app_settings
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_app_settings_updated_at
      BEFORE UPDATE ON app_settings
      FOR EACH ROW
      EXECUTE FUNCTION set_app_settings_updated_at()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON app_settings`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_app_settings_updated_at`);
    await queryRunner.query(`DROP TABLE IF EXISTS app_settings`);
  }
}
