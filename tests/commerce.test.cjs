const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://campus_test@127.0.0.1:55439/campus_drop_test";
if (new URL(process.env.DATABASE_URL).pathname !== "/campus_drop_test")
  throw new Error("Tests require the isolated campus_drop_test database.");
process.env.JWT_SECRET = "isolated-integration-test-secret-not-for-production";
process.env.FCM_PROJECT_ID = "";
require("reflect-metadata");
const { NestFactory } = require("@nestjs/core");
const { ValidationPipe } = require("@nestjs/common");
const { DataSource } = require("typeorm");
const bcrypt = require("bcrypt");
const { AppModule } = require("../dist/app.module");
const { ApiErrorFilter } = require("../dist/modules/shared/error.filter");
const E = require("../dist/platform/entities");
const { Address } = require("../dist/modules/shared/entities");
let app,
  db,
  base,
  student,
  otherStudent,
  otherCampusStudent,
  vendorUser,
  otherVendorUser,
  admin,
  limitedAdmin,
  university,
  campus,
  vendor,
  otherVendor,
  product,
  address,
  order;
const tokens = {};
const suffix = randomUUID();
async function http(path, method = "GET", body, role = "student") {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
const input = (overrides = {}) => ({
  vendorId: vendor.id,
  addressId: address.id,
  paymentMethod: "COD",
  idempotencyKey: randomUUID(),
  items: [{ productId: product.id, quantity: 2 }],
  ...overrides,
});
before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiErrorFilter());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(DataSource);
  university = await db.getRepository(E.University).save({
    name: "TEST University A",
    slug: `test-a-${suffix}`,
    state: "Test state",
    city: "Test city",
  });
  const uniB = await db.getRepository(E.University).save({
    name: "TEST University B",
    slug: `test-b-${suffix}`,
    state: "Test state",
    city: "Test city",
  });
  campus = await db.getRepository(E.Campus).save({
    universityId: university.id,
    name: "TEST Campus A",
    slug: "main",
    serviceEnabled: true,
    codEnabled: true,
    deliveryFeePaise: 1500,
    platformFeePaise: 500,
    codLimitPaise: 100000,
  });
  const campusB = await db.getRepository(E.Campus).save({
    universityId: uniB.id,
    name: "TEST Campus B",
    slug: "main",
    serviceEnabled: true,
  });
  const campusA2 = await db.getRepository(E.Campus).save({
    universityId: university.id,
    name: "TEST Campus A2",
    slug: "second",
    serviceEnabled: true,
  });
  const hash = await bcrypt.hash("TestPasswordOnly!123", 4);
  async function user(role, uni, site, name) {
    return db.getRepository(E.User).save({
      name,
      email: `${name}-${suffix}@example.invalid`,
      passwordHash: hash,
      role,
      universityId: uni?.id,
      campusId: site?.id,
      verified: true,
    });
  }
  student = await user("STUDENT", university, campus, "student");
  otherStudent = await user("STUDENT", uniB, campusB, "other");
  otherCampusStudent = await user(
    "STUDENT",
    university,
    campusA2,
    "othercampus",
  );
  vendorUser = await user("VENDOR", university, campus, "vendor");
  otherVendorUser = await user("VENDOR", uniB, campusB, "othervendor");
  admin = await user("SUPER_ADMIN", null, null, "admin");
  limitedAdmin = await user("ADMIN", null, null, "limitedadmin");
  vendor = await db.getRepository(E.Vendor).save({
    name: "TEST Shop A",
    slug: `shop-a-${suffix}`,
    ownerId: vendorUser.id,
    universityId: university.id,
    campusId: campus.id,
    approvalStatus: "APPROVED",
    operatingStatus: "OPEN",
    verified: true,
    commissionRateBps: 1000,
  });
  otherVendor = await db.getRepository(E.Vendor).save({
    name: "TEST Shop B",
    slug: `shop-b-${suffix}`,
    ownerId: otherVendorUser.id,
    universityId: uniB.id,
    campusId: campusB.id,
    approvalStatus: "APPROVED",
    operatingStatus: "OPEN",
    verified: true,
  });
  product = await db.getRepository(E.Product).save({
    name: "TEST Meal",
    pricePaise: 10000,
    vendorId: vendor.id,
    universityId: university.id,
    campusId: campus.id,
    stock: 100,
  });
  await db.getRepository(E.Product).save({
    name: "TEST Other Meal",
    pricePaise: 10000,
    vendorId: otherVendor.id,
    universityId: uniB.id,
    campusId: campusB.id,
    stock: 100,
  });
  address = await db.getRepository(Address).save({
    userId: student.id,
    campusId: campus.id,
    label: "TEST Hostel",
    building: "A",
    details: "Room 101",
    phone: "9999999999",
  });
  for (const [key, u] of Object.entries({
    student,
    other: otherStudent,
    othercampus: otherCampusStudent,
    vendor: vendorUser,
    othervendor: otherVendorUser,
    admin,
    limitedadmin: limitedAdmin,
  })) {
    const login = await http(
      "/v1/auth/login",
      "POST",
      { email: u.email, password: "TestPasswordOnly!123" },
      "anonymous",
    );
    assert.equal(login.status, 201);
    tokens[key] = login.body.accessToken;
  }
});
after(async () => {
  if (app) await app.close();
});
test("registration cannot grant admin role", async () => {
  const r = await http(
    "/v1/auth/register",
    "POST",
    {
      name: "TEST Intruder",
      email: `intruder-${suffix}@example.invalid`,
      password: "TestPasswordOnly!123",
      phone: "9999999999",
      universityId: university.id,
      campusId: campus.id,
      role: "ADMIN",
    },
    "anonymous",
  );
  assert.equal(r.status, 400);
});
test("new vendor is pending and cannot publish products", async () => {
  const otp = await http(
    "/v1/auth/registration-otp/request",
    "POST",
    { phone: "9999999999" },
    "anonymous",
  );
  assert.equal(otp.status, 201);
  const r = await http(
    "/v1/auth/vendor-register",
    "POST",
    {
      name: "TEST Applicant",
      email: `applicant-${suffix}@example.invalid`,
      password: "TestPasswordOnly!123",
      phone: "9999999999",
      universityId: university.id,
      campusId: campus.id,
      shopName: "TEST Pending shop",
      address: "TEST Campus building",
      otp: otp.body.demoOtp,
      otpChallenge: otp.body.challenge,
    },
    "anonymous",
  );
  assert.equal(r.status, 201);
  tokens.pending = r.body.accessToken;
  const p = await http(
    "/v1/vendor/products",
    "POST",
    { name: "TEST Item", pricePaise: 100 },
    "pending",
  );
  assert.equal(p.status, 403);
});
test("university deletion removes its shops and catalog when it has no orders", async () => {
  const removable = await db.getRepository(E.University).save({
    slug: `TEST-remove-${suffix}`,
    name: "TEST Removable University",
    state: "Punjab",
    city: "Bathinda",
    type: "PRIVATE",
  });
  const removableCampus = await db.getRepository(E.Campus).save({
    universityId: removable.id,
    slug: `TEST-remove-campus-${suffix}`,
    name: "TEST Removable Campus",
    serviceEnabled: true,
  });
  const removableOwner = await db.getRepository(E.User).save({
    name: "TEST Removable Seller",
    email: `removable-seller-${suffix}@example.invalid`,
    phone: "8888888888",
    passwordHash: await bcrypt.hash("TestPasswordOnly!123", 8),
    role: E.UserRole.VENDOR,
    universityId: removable.id,
    campusId: removableCampus.id,
    verified: true,
  });
  const removableVendor = await db.getRepository(E.Vendor).save({
    slug: `TEST-remove-shop-${suffix}`,
    name: "TEST Removable Shop",
    ownerId: removableOwner.id,
    universityId: removable.id,
    campusId: removableCampus.id,
  });
  const removableCategory = await db.getRepository(E.Category).save({
    universityId: removable.id,
    name: `TEST Remove Category ${suffix}`,
  });
  await db.getRepository(E.Product).save({
    vendorId: removableVendor.id,
    universityId: removable.id,
    campusId: removableCampus.id,
    categoryId: removableCategory.id,
    name: "TEST Removable Product",
    pricePaise: 100,
  });
  const removed = await http(
    `/v1/admin/universities/${removable.id}`,
    "DELETE",
    undefined,
    "admin",
  );
  assert.equal(removed.status, 200);
  assert.equal(await db.getRepository(E.University).existsBy({ id: removable.id }), false);
  assert.equal(await db.getRepository(E.Vendor).countBy({ universityId: removable.id }), 0);
  assert.equal(await db.getRepository(E.Product).countBy({ universityId: removable.id }), 0);
  const retiredOwner = await db.getRepository(E.User).findOneByOrFail({ id: removableOwner.id });
  assert.equal(retiredOwner.universityId, null);
  assert.equal(retiredOwner.campusId, null);
  assert.equal(retiredOwner.status, E.RecordStatus.SUSPENDED);
});
test("student cannot access class-guarded administrator endpoints", async () => {
  assert.equal((await http("/v1/admin/overview")).status, 403);
  assert.equal((await http("/v1/admin/users")).status, 403);
  assert.equal(
    (await http("/v1/admin/overview", "GET", undefined, "admin")).status,
    200,
  );
});
test("only super admin can create, list and remove administrators", async () => {
  const body = {
    name: "TEST Operations Admin",
    email: `operations-${suffix}@example.invalid`,
    phone: "9876543210",
    password: "StrongAdminPassword!123",
  };
  assert.equal(
    (await http("/v1/admin/administrators", "POST", body, "limitedadmin")).status,
    403,
  );
  assert.equal(
    (await http("/v1/admin/administrators", "GET", undefined, "limitedadmin")).status,
    403,
  );
  const created = await http("/v1/admin/administrators", "POST", body, "admin");
  assert.equal(created.status, 201);
  assert.equal(created.body.role, "ADMIN");
  assert.equal(created.body.passwordHash, undefined);
  const listed = await http("/v1/admin/administrators?q=Operations", "GET", undefined, "admin");
  assert.equal(listed.status, 200);
  assert.ok(listed.body.items.some((row) => row.id === created.body.id));
  assert.equal(
    (await http(`/v1/admin/administrators/${admin.id}`, "DELETE", undefined, "admin")).status,
    403,
  );
  assert.equal(
    (await http(`/v1/admin/administrators/${created.body.id}`, "DELETE", undefined, "admin")).status,
    200,
  );
  assert.equal(
    (await db.getRepository(E.User).findOneBy({ id: created.body.id })).status,
    "SUSPENDED",
  );
});
test("student cannot access vendor endpoints", async () => {
  assert.equal((await http("/v1/vendor/products")).status, 403);
});
test("catalog is isolated to student campus", async () => {
  const r = await http("/v1/catalog");
  assert.equal(r.status, 200);
  assert.ok(r.body.products.every((p) => p.campusId === campus.id));
  assert.ok(!r.body.vendors.some((v) => v.id === otherVendor.id));
});
test("catalog quick filters are server-enforced and campus scoped", async () => {
  const cheapVegetarian = await db.getRepository(E.Product).save({
    name: `TEST Veg Snack ${suffix}`,
    pricePaise: 9900,
    vendorId: vendor.id,
    universityId: university.id,
    campusId: campus.id,
    vegetarian: true,
    stock: 10,
  });
  const under99 = await http("/v1/catalog?maxPricePaise=9900");
  assert.equal(under99.status, 200);
  assert.ok(under99.body.products.every((item) => item.pricePaise <= 9900));
  assert.ok(under99.body.products.some((item) => item.id === cheapVegetarian.id));
  const veg = await http("/v1/catalog?vegetarian=true");
  assert.equal(veg.status, 200);
  assert.ok(veg.body.products.every((item) => item.vegetarian));
  const open = await http("/v1/catalog?openOnly=true");
  assert.equal(open.status, 200);
  assert.ok(open.body.products.some((item) => item.id === cheapVegetarian.id));
  const rated = await http("/v1/catalog?sort=TOP_RATED");
  assert.equal(rated.status, 200);
  assert.ok(rated.body.products.every((item) => item.campusId === campus.id));
});
test("payment operations are admin-only and use authoritative order records", async () => {
  assert.equal((await http("/v1/admin/payments")).status, 403);
  const result = await http("/v1/admin/payments", "GET", undefined, "admin");
  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body.items));
});
test("product details enforce campus scope and hide vendor private fields", async () => {
  const mine = await http(`/v1/products/${product.id}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.vendor.ownerId, undefined);
  assert.equal(mine.body.vendor.commissionRateBps, undefined);
  assert.equal(
    (await http(`/v1/products/${product.id}`, "GET", undefined, "other"))
      .status,
    404,
  );
  assert.equal(
    (await http(`/v1/products/${product.id}`, "GET", undefined, "othercampus"))
      .status,
    404,
  );
});
test("admin-created vendors remain pending and creation is audited without exposing a token", async () => {
  const body = {
    name: "TEST Admin-created owner",
    email: `managed-${suffix}@example.invalid`,
    password: "TestPasswordOnly!123",
    phone: "9999999999",
    universityId: university.id,
    campusId: campus.id,
    shopName: "TEST Managed shop",
    address: "TEST Campus building",
  };
  assert.equal((await http("/v1/admin/vendors", "POST", body)).status, 403);
  const result = await http("/v1/admin/vendors", "POST", body, "admin");
  assert.equal(result.status, 201);
  assert.equal(result.body.accessToken, undefined);
  assert.equal(result.body.user.passwordHash, undefined);
  const shop = await db
    .getRepository(E.Vendor)
    .findOneBy({ ownerId: result.body.user.id });
  assert.equal(shop.approvalStatus, "PENDING");
  assert.ok(
    await db.getRepository(E.AuditLog).existsBy({
      actorId: admin.id,
      entityId: result.body.user.id,
      action: "VENDOR_ACCOUNT_CREATED",
    }),
  );
});

test("admin product creation derives tenant scope and rejects a foreign category", async () => {
  const category = await db.getRepository(E.Category).save({
    universityId: university.id,
    name: `TEST Snacks ${suffix}`,
    active: true,
  });
  const foreignCategory = await db.getRepository(E.Category).save({
    universityId: otherVendor.universityId,
    name: `TEST Foreign Snacks ${suffix}`,
    active: true,
  });
  const payload = {
    vendorId: vendor.id,
    categoryId: category.id,
    name: "TEST Admin Product",
    description: "Created from the operations panel",
    pricePaise: 8500,
    stock: 25,
    image: "https://example.invalid/product.jpg",
  };
  assert.equal((await http("/v1/admin/products", "POST", payload)).status, 403);
  const created = await http("/v1/admin/products", "POST", payload, "admin");
  assert.equal(created.status, 201);
  assert.equal(created.body.vendorId, vendor.id);
  assert.equal(created.body.universityId, vendor.universityId);
  assert.equal(created.body.campusId, vendor.campusId);
  assert.equal(created.body.categoryId, category.id);
  assert.equal(created.body.available, true);
  assert.equal(created.body.active, true);
  assert.equal(
    (
      await http(
        "/v1/admin/products",
        "POST",
        { ...payload, categoryId: foreignCategory.id },
        "admin",
      )
    ).status,
    403,
  );
});
test("admin can edit and safely remove categories without deleting product history", async () => {
  const category = await db.getRepository(E.Category).save({
    universityId: university.id,
    name: `TEST Editable Category ${suffix}`,
    active: true,
  });
  const updated = await http(
    `/v1/admin/categories/${category.id}`,
    "PATCH",
    { name: `TEST Updated Category ${suffix}`, image: "https://example.invalid/category.jpg", active: true },
    "admin",
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, `TEST Updated Category ${suffix}`);
  const removed = await http(`/v1/admin/categories/${category.id}`, "DELETE", undefined, "admin");
  assert.equal(removed.status, 200);
  assert.equal((await db.getRepository(E.Category).findOneBy({ id: category.id })).active, false);
});
test("cross-university ordering is rejected", async () => {
  assert.equal(
    (await http("/v1/orders", "POST", input(), "other")).status,
    403,
  );
});
test("changed checkout total rejects the order and rolls back stock", async () => {
  const before = await db
    .getRepository(E.Product)
    .findOneBy({ id: product.id });
  const r = await http("/v1/orders", "POST", input({ expectedTotalPaise: 1 }));
  assert.equal(r.status, 409);
  assert.equal(
    (await db.getRepository(E.Product).findOneBy({ id: product.id })).stock,
    before.stock,
  );
});
test("cross-campus ordering is rejected", async () => {
  assert.equal(
    (await http("/v1/orders", "POST", input(), "othercampus")).status,
    403,
  );
});
test("frontend financial fields are rejected", async () => {
  assert.equal(
    (await http("/v1/orders", "POST", input({ totalPaise: 1 }))).status,
    400,
  );
});
test("unimplemented payment methods are rejected", async () => {
  assert.equal(
    (await http("/v1/orders", "POST", input({ paymentMethod: "UPI" }))).status,
    400,
  );
});
test("closed shop cannot receive orders", async () => {
  await db
    .getRepository(E.Vendor)
    .update(vendor.id, { operatingStatus: "CLOSED" });
  assert.equal((await http("/v1/orders", "POST", input())).status, 403);
  await db
    .getRepository(E.Vendor)
    .update(vendor.id, { operatingStatus: "OPEN" });
});
test("unavailable product cannot be ordered", async () => {
  await db.getRepository(E.Product).update(product.id, { available: false });
  assert.equal((await http("/v1/orders", "POST", input())).status, 403);
  await db.getRepository(E.Product).update(product.id, { available: true });
});
test("concurrent checkout retries create one order and reserve stock once", async () => {
  const dto = input();
  const results = await Promise.all([
    http("/v1/orders", "POST", dto),
    http("/v1/orders", "POST", dto),
    http("/v1/orders", "POST", dto),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [201, 201, 201],
  );
  assert.equal(new Set(results.map((r) => r.body.id)).size, 1);
  order = results[0].body;
  assert.equal(order.totalPaise, 22000);
  assert.equal(order.paymentStatus, "PENDING");
  assert.match(order.deliveryPin, /^\d{6}$/);
  assert.equal(order.deliveryPinHash, undefined);
  assert.equal(
    (await db.getRepository(E.Product).findOneBy({ id: product.id })).stock,
    98,
  );
  assert.equal(
    (
      await http("/v1/orders", "POST", {
        ...dto,
        items: [{ productId: product.id, quantity: 3 }],
      })
    ).status,
    409,
  );
});
test("another student cannot read or cancel the order", async () => {
  assert.equal(
    (await http(`/v1/orders/${order.id}`, "GET", undefined, "other")).status,
    404,
  );
  assert.equal(
    (
      await http(
        `/v1/orders/${order.id}/status`,
        "PATCH",
        { status: "CANCELLED_BY_USER", reason: "Test" },
        "other",
      )
    ).status,
    404,
  );
});
test("another vendor cannot read orders or change products", async () => {
  assert.equal(
    (await http(`/v1/orders/${order.id}`, "GET", undefined, "othervendor"))
      .status,
    404,
  );
  assert.equal(
    (
      await http(
        `/v1/vendor/products/${product.id}`,
        "PATCH",
        { name: "Modified", pricePaise: 1 },
        "othervendor",
      )
    ).status,
    404,
  );
});
test("student cannot perform seller order transitions", async () => {
  assert.equal(
    (
      await http(`/v1/orders/${order.id}/status`, "PATCH", {
        status: "VENDOR_ACCEPTED",
      })
    ).status,
    403,
  );
});
test("COD seller delivery follows state machine and keeps cash separate", async () => {
  assert.equal(
    (
      await http(
        `/v1/orders/${order.id}/status`,
        "PATCH",
        { status: "DELIVERED" },
        "vendor",
      )
    ).status,
    403,
  );
  for (const status of [
    "VENDOR_ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "OUT_FOR_DELIVERY",
  ])
    assert.equal(
      (
        await http(
          `/v1/orders/${order.id}/status`,
          "PATCH",
          { status },
          "vendor",
        )
      ).status,
      200,
    );
  const view = await http(`/v1/orders/${order.id}`, "GET", undefined, "vendor");
  assert.equal(view.body.deliveryPin, undefined);
  assert.equal(view.body.deliveryPinHash, undefined);
  const wrong = order.deliveryPin === "000000" ? "000001" : "000000";
  assert.equal(
    (
      await http(
        `/v1/orders/${order.id}/status`,
        "PATCH",
        { status: "DELIVERED", pin: wrong },
        "vendor",
      )
    ).status,
    403,
  );
  const delivered = await http(
    `/v1/orders/${order.id}/status`,
    "PATCH",
    { status: "DELIVERED", pin: order.deliveryPin },
    "vendor",
  );
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.paymentStatus, "PENDING");
  assert.equal(
    (
      await http(
        `/v1/orders/${order.id}/cash`,
        "POST",
        { amountPaise: 1 },
        "vendor",
      )
    ).status,
    403,
  );
  const paid = await http(
    `/v1/orders/${order.id}/cash`,
    "POST",
    { amountPaise: 22000 },
    "vendor",
  );
  assert.equal(paid.status, 201);
  assert.equal(paid.body.paymentStatus, "SUCCESS");
  const again = await http(
    `/v1/orders/${order.id}/cash`,
    "POST",
    { amountPaise: 22000 },
    "vendor",
  );
  assert.equal(again.body.cashCollectedAt, paid.body.cashCollectedAt);
  assert.equal(
    (await http(`/v1/orders/${order.id}/cash`, "POST", { amountPaise: 22000 }))
      .status,
    403,
  );
});
test("concurrent demand cannot oversell the last item", async () => {
  const p = await db.getRepository(E.Product).save({
    name: "TEST Limited",
    pricePaise: 1000,
    vendorId: vendor.id,
    universityId: university.id,
    campusId: campus.id,
    stock: 1,
  });
  const results = await Promise.all([
    http(
      "/v1/orders",
      "POST",
      input({ items: [{ productId: p.id, quantity: 1 }] }),
    ),
    http(
      "/v1/orders",
      "POST",
      input({ items: [{ productId: p.id, quantity: 1 }] }),
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 403]);
  assert.equal(
    (await db.getRepository(E.Product).findOneBy({ id: p.id })).stock,
    0,
  );
});
test("cancellation releases stock exactly once", async () => {
  const created = await http("/v1/orders", "POST", input());
  const id = created.body.id;
  const before = (
    await db.getRepository(E.Product).findOneBy({ id: product.id })
  ).stock;
  assert.equal(
    (
      await http(`/v1/orders/${id}/status`, "PATCH", {
        status: "CANCELLED_BY_USER",
        reason: "Changed plans",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await http(`/v1/orders/${id}/status`, "PATCH", {
        status: "CANCELLED_BY_USER",
        reason: "Changed plans",
      })
    ).status,
    403,
  );
  assert.equal(
    (await db.getRepository(E.Product).findOneBy({ id: product.id })).stock,
    before + 2,
  );
});
test("inbox only exposes current user notifications", async () => {
  const mine = await http("/v1/notifications");
  const other = await http("/v1/notifications", "GET", undefined, "other");
  assert.ok(mine.body.some((n) => n.orderId === order.id));
  assert.ok(!other.body.some((n) => n.orderId === order.id));
});
test("suspension invalidates existing authenticated access immediately", async () => {
  await db.getRepository(E.User).update(student.id, { status: "SUSPENDED" });
  assert.equal((await http("/v1/catalog")).status, 401);
  await db.getRepository(E.User).update(student.id, { status: "ACTIVE" });
});
test('coupons enforce scope, caps and one-use concurrency',async()=>{
  const code='C'+suffix.replaceAll('-','').slice(0,20).toUpperCase();
  const created=await http('/v1/admin/coupons','POST',{code,type:'PERCENTAGE',value:20,minOrderPaise:10000,maxDiscountPaise:1500,universityId:university.id,campusId:campus.id,vendorId:vendor.id,endsAt:new Date(Date.now()+86400000).toISOString(),usageLimit:1,perUserLimit:1,active:true},'admin');
  assert.equal(created.status,201);
  const quote=await http('/v1/checkout/quote','POST',input({couponCode:code}));
  assert.equal(quote.status,201);assert.equal(quote.body.discountPaise,1500);assert.equal(quote.body.totalPaise,20500);
  const results=await Promise.all([http('/v1/orders','POST',input({couponCode:code,expectedTotalPaise:20500})),http('/v1/orders','POST',input({couponCode:code,expectedTotalPaise:20500}))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,403]);
  const placed=results.find(r=>r.status===201).body;assert.equal(placed.discountPaise,1500);assert.equal(placed.commissionPaise,1850);
  assert.equal((await http('/v1/checkout/quote','POST',input({couponCode:code}))).status,403);
});
test('expired and wrong-campus coupons cannot be applied',async()=>{
  for(const extra of [{endsAt:new Date(Date.now()-1000)},{campusId:otherCampusStudent.campusId}]){
    const code='C'+randomUUID().replaceAll('-','').slice(0,20).toUpperCase();
    await db.getRepository(E.Coupon).save({code,type:'FIXED',value:1000,minOrderPaise:0,usageLimit:5,perUserLimit:1,...extra});
    assert.equal((await http('/v1/orders','POST',input({couponCode:code}))).status,403);
  }
});
test('only delivered order owner can review once; reviews respect campus and moderation',async()=>{
  const body={orderId:order.id,rating:4,comment:'TEST Verified order review'};
  assert.equal((await http('/v1/reviews','POST',body,'other')).status,403);
  const pending=await http('/v1/orders','POST',input());
  assert.equal((await http('/v1/reviews','POST',{...body,orderId:pending.body.id})).status,403);
  const result=await http('/v1/reviews','POST',body);assert.equal(result.status,201);
  assert.equal((await http('/v1/reviews','POST',body)).status,403);
  const reviews=await http(`/v1/vendors/${vendor.id}/reviews`);assert.equal(reviews.body.count,1);assert.equal(reviews.body.rating,4);assert.equal(reviews.body.items[0].userId,undefined);
  assert.equal((await http(`/v1/vendors/${vendor.id}/reviews`,'GET',undefined,'other')).status,404);
  assert.equal((await http(`/v1/admin/reviews/${result.body.id}`,'PATCH',{visible:false})).status,403);
  assert.equal((await http(`/v1/admin/reviews/${result.body.id}`,'PATCH',{visible:false},'admin')).status,200);
  assert.equal((await http(`/v1/vendors/${vendor.id}/reviews`)).body.count,0);
});
test('address changes enforce ownership and preserve order snapshots',async()=>{
  const dto={label:'TEST New',building:'Block B',details:'Room 202',phone:'9999999999'};
  assert.equal((await http(`/v1/addresses/${address.id}`,'PATCH',dto,'other')).status,404);
  assert.equal((await http(`/v1/addresses/${address.id}`,'DELETE',undefined,'other')).status,404);
  assert.equal((await http(`/v1/addresses/${address.id}`,'PATCH',dto)).status,200);
  assert.ok((await http(`/v1/orders/${order.id}`)).body.deliveryAddress.includes('Room 101'));
});
test('category filter and vendor dashboard are server scoped',async()=>{
  assert.equal((await http(`/v1/catalog?categoryId=${randomUUID()}`)).body.total,0);
  assert.equal((await http('/v1/vendor/dashboard')).status,403);
  const dashboard=await http('/v1/vendor/dashboard','GET',undefined,'vendor');assert.equal(dashboard.status,200);assert.ok(dashboard.body.orders>0);
});
test("logout revokes existing JWT", async () => {
  assert.equal(
    (await http("/v1/auth/logout", "POST", undefined, "other")).status,
    201,
  );
  assert.equal(
    (await http("/v1/auth/me", "GET", undefined, "other")).status,
    401,
  );
});
test('university creation needs only a name and generates unique internal slugs',async()=>{
  const name='  TEST विश्वविद्यालय & University '+suffix+'  ';
  const first=await http('/v1/admin/universities','POST',{name},'admin');
  const second=await http('/v1/admin/universities','POST',{name},'admin');
  assert.equal(first.status,201);assert.equal(second.status,201);
  assert.equal(first.body.name,name.trim());assert.notEqual(first.body.slug,second.body.slug);
  assert.equal((await http('/v1/admin/universities','POST',{name:'   '},'admin')).status,400);
  const c=await http('/v1/admin/campuses','POST',{name:'TEST Main Campus',universityId:first.body.id},'admin');
  assert.equal(c.status,201);assert.ok(c.body.slug);
});

