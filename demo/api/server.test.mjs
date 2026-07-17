import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startDemoServer } from "./server.mjs";

let base;
let candidate;
let baseUrl;
let candidateUrl;

before(async () => {
  base = await startDemoServer({ variant: "base", port: 0 });
  candidate = await startDemoServer({ variant: "candidate", port: 0 });
  baseUrl = `http://127.0.0.1:${base.address().port}`;
  candidateUrl = `http://127.0.0.1:${candidate.address().port}`;
});

after(async () => {
  await Promise.all([
    new Promise((resolve) => base.close(resolve)),
    new Promise((resolve) => candidate.close(resolve)),
  ]);
});

test("changes only the planted pagination and error-template behaviors", async () => {
  const [baseProducts, candidateProducts, baseError, candidateError] = await Promise.all([
    fetch(`${baseUrl}/products`).then((response) => response.json()),
    fetch(`${candidateUrl}/products`).then((response) => response.json()),
    fetch(`${baseUrl}/discounts/EXPIRED`).then((response) => response.json()),
    fetch(`${candidateUrl}/discounts/EXPIRED`).then((response) => response.json()),
  ]);

  assert.equal(baseProducts.next_cursor, "page-2");
  assert.equal(candidateProducts.cursor, "page-2");
  assert.equal(baseError.error, "coupon code invalid: EXPIRED");
  assert.equal(candidateError.error, "invalid discount code: EXPIRED");

  const [baseCustomer, candidateCustomer] = await Promise.all([
    fetch(`${baseUrl}/customers/cust_01`).then((response) => response.json()),
    fetch(`${candidateUrl}/customers/cust_01`).then((response) => response.json()),
  ]);
  assert.deepEqual(baseCustomer, candidateCustomer);
  assert.equal(baseCustomer.legacy_id, "legacy-cust_01");
});

test("implements eight e-commerce resource endpoints", async () => {
  const checks = [
    ["/products", 200],
    ["/products/prod_01", 200],
    ["/orders/order_01", 200],
    ["/customers/cust_01", 200],
    ["/inventory/prod_01", 200],
    ["/search?q=mug", 200],
    ["/discounts/EXPIRED", 422],
  ];
  for (const [path, status] of checks) {
    assert.equal((await fetch(`${baseUrl}${path}`)).status, status, path);
  }
  assert.equal(
    (
      await fetch(`${baseUrl}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ product_id: "prod_01", quantity: 1 }] }),
      })
    ).status,
    201,
  );
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
});
