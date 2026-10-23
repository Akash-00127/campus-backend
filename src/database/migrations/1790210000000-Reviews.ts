import { MigrationInterface, QueryRunner } from "typeorm";
export class Reviews1790210000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TABLE reviews (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(), "orderId" uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT, "userId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, "vendorId" uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT, rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), comment varchar NOT NULL, visible boolean NOT NULL DEFAULT true)`,
    );
    await q.query(
      `CREATE INDEX reviews_vendor_created ON reviews("vendorId","createdAt" DESC)`,
    );
    await q.query(`CREATE INDEX reviews_user ON reviews("userId")`);
    await q.query(
      `CREATE INDEX orders_coupon_student ON orders("couponCode","studentId")`,
    );
  }
  async down() {
    throw new Error("Review data rollback requires manual review.");
  }
}
