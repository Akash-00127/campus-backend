import { MigrationInterface, QueryRunner } from "typeorm";
export class CommerceIntegrity1790121700000 implements MigrationInterface {
  async up(q: QueryRunner) {
    const columns: { table_name: string; column_name: string }[] =
      await q.query(
        `SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND data_type='character varying' AND column_name IN ('universityId','campusId','ownerId','vendorId','studentId','orderId','productId','userId','categoryId','actorId','cashCollectedBy')`,
      );
    for (const c of columns)
      await q.query(
        `ALTER TABLE "${c.table_name}" ALTER COLUMN "${c.column_name}" TYPE uuid USING "${c.column_name}"::uuid`,
      );
    await q.query(
      `ALTER TABLE products ADD CONSTRAINT product_price_positive CHECK ("pricePaise" > 0), ADD CONSTRAINT stock_nonnegative CHECK (stock IS NULL OR stock >= 0)`,
    );
    await q.query(
      `ALTER TABLE campuses ADD CONSTRAINT campus_fees_valid CHECK ("deliveryFeePaise" >= 0 AND "platformFeePaise" >= 0 AND "codLimitPaise" > 0)`,
    );
    await q.query(
      `ALTER TABLE vendors ADD CONSTRAINT commission_valid CHECK ("commissionRateBps" BETWEEN 0 AND 10000)`,
    );
    await q.query(
      `ALTER TABLE orders ADD CONSTRAINT order_amount_valid CHECK ("totalPaise" > 0 AND "subtotalPaise" > 0 AND "discountPaise" >= 0), ADD CONSTRAINT cash_amount_valid CHECK ("cashCollectedPaise" IS NULL OR "cashCollectedPaise" = "totalPaise")`,
    );
    await q.query(
      `ALTER TABLE order_items ADD CONSTRAINT order_quantity_valid CHECK (quantity > 0 AND "unitPricePaise" > 0)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX vendor_owner_unique ON vendors ("ownerId")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX campus_tenant_unique ON campuses (id,"universityId")`,
    );
    await q.query(
      `ALTER TABLE vendors ADD CONSTRAINT vendor_campus_tenant_fk FOREIGN KEY ("campusId","universityId") REFERENCES campuses (id,"universityId")`,
    );
    await q.query(
      `ALTER TABLE users ADD CONSTRAINT user_campus_tenant_fk FOREIGN KEY ("campusId","universityId") REFERENCES campuses (id,"universityId")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX vendor_tenant_unique ON vendors (id,"universityId","campusId")`,
    );
    await q.query(
      `ALTER TABLE products ADD CONSTRAINT product_vendor_tenant_fk FOREIGN KEY ("vendorId","universityId","campusId") REFERENCES vendors (id,"universityId","campusId")`,
    );
    await q.query(
      `ALTER TABLE orders ADD CONSTRAINT order_vendor_tenant_fk FOREIGN KEY ("vendorId","universityId","campusId") REFERENCES vendors (id,"universityId","campusId")`,
    );
    await q.query(
      `ALTER TABLE categories ADD CONSTRAINT category_university_fk FOREIGN KEY ("universityId") REFERENCES universities(id)`,
    );
    await q.query(
      `ALTER TABLE order_status_history ADD CONSTRAINT history_order_fk FOREIGN KEY ("orderId") REFERENCES orders(id)`,
    );
    await q.query(
      `ALTER TABLE notifications ADD CONSTRAINT notification_user_fk FOREIGN KEY ("userId") REFERENCES users(id), ADD CONSTRAINT notification_order_fk FOREIGN KEY ("orderId") REFERENCES orders(id)`,
    );
    await q.query(
      `ALTER TABLE device_tokens ADD CONSTRAINT device_user_fk FOREIGN KEY ("userId") REFERENCES users(id)`,
    );
    await q.query(
      `ALTER TABLE support_tickets ADD CONSTRAINT support_user_fk FOREIGN KEY ("userId") REFERENCES users(id)`,
    );
    await q.query(
      `CREATE INDEX orders_student_created ON orders ("studentId","createdAt" DESC)`,
    );
    await q.query(
      `CREATE INDEX orders_vendor_status_created ON orders ("vendorId",status,"createdAt" DESC)`,
    );
    await q.query(
      `CREATE INDEX products_campus_active ON products ("universityId","campusId",active,available)`,
    );
    await q.query(
      `CREATE INDEX notification_pending ON notifications ("nextAttemptAt","createdAt") WHERE "pushStatus" = 'PENDING'`,
    );
  }
  async down(): Promise<void> {
    throw new Error(
      "Restore a reviewed backup; automatic rollback of integrity constraints is disabled.",
    );
  }
}
