import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenColumns1744700000000 implements MigrationInterface {
  name = 'AddRefreshTokenColumns1744700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "refreshTokenHash" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "refreshTokenExpiresAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "refreshTokenHash"`);
  }
}
