import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductDietaryFilters1790211000000 implements MigrationInterface {
  name = "ProductDietaryFilters1790211000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "vegetarian" boolean NOT NULL DEFAULT false',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "products" DROP COLUMN IF EXISTS "vegetarian"');
  }
}
