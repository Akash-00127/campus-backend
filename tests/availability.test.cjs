const { test } = require("node:test");
const assert = require("node:assert/strict");
const { acceptsOrders } = require("../dist/modules/catalog/availability");
test("night shops accept orders at 2am IST but stop at closing time", () => {
  const vendor = {
    operatingStatus: "OPEN",
    operatingHours: { alwaysOpen: false, open: "20:00", close: "03:00" },
  };
  assert.equal(acceptsOrders(vendor, new Date("2026-09-22T20:30:00Z")), true);
  assert.equal(acceptsOrders(vendor, new Date("2026-09-22T21:30:00Z")), false);
  assert.equal(acceptsOrders(vendor, new Date("2026-09-23T06:30:00Z")), false);
});
test("manual closure overrides 24 hour schedule", () => {
  assert.equal(
    acceptsOrders({
      operatingStatus: "CLOSED",
      operatingHours: { alwaysOpen: true, open: "00:00", close: "00:00" },
    }),
    false,
  );
});
test("equal opening and closing times do not imply 24 hour trading", () => {
  assert.equal(
    acceptsOrders({
      operatingStatus: "OPEN",
      operatingHours: { alwaysOpen: false, open: "00:00", close: "00:00" },
    }),
    false,
  );
});
