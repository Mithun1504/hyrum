import { createHash } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createGzip } from "node:zlib";

const organizationId = "00000000-0000-4000-8000-000000000001";
const outputPath = resolve(
  process.cwd(),
  process.argv[2] ?? "fixtures/demo/traffic-50000.ndjson.gz",
);
const manifestPath = resolve(dirname(outputPath), "manifest.json");
const count = 50_000;

const request = (method, path, query = undefined) => ({
  method,
  path,
  ...(query ? { query } : {}),
});
const response = (status, body) => ({ status, body });

function event(cycle, offset) {
  const sessionBase = String(cycle).padStart(5, "0");
  const occurredAt = new Date(Date.UTC(2026, 6, 14, 12, 0, cycle % 60, offset)).toISOString();
  const common = {
    organization_id: organizationId,
    event_id: `evt-${sessionBase}-${offset}`,
    occurred_at: occurredAt,
    session_complete: new Set([1, 3, 4, 5, 7, 9]).has(offset),
  };

  switch (offset) {
    case 0:
      return {
        ...common,
        session_id: `consumer-a-${sessionBase}`,
        consumer_value: "consumer-a-scripted",
        sequence: 1,
        request: request("GET", "/products"),
        response: response(200, { data: [{ id: "prod_01" }], next_cursor: "page-2" }),
      };
    case 1:
      return {
        ...common,
        session_id: `consumer-a-${sessionBase}`,
        consumer_value: "consumer-a-scripted",
        sequence: 2,
        request: request("GET", "/products", { cursor: "page-2" }),
        response: response(200, { data: [{ id: "prod_03" }] }),
      };
    case 2: {
      const redeemed = cycle % 2 === 1;
      return {
        ...common,
        session_id: `consumer-b-${sessionBase}`,
        consumer_value: "consumer-b-scripted",
        sequence: 1,
        request: request("GET", "/discounts/DEMO"),
        response: response(422, {
          error: redeemed ? "coupon already redeemed: USED" : "coupon code invalid: EXPIRED",
        }),
      };
    }
    case 3: {
      const redeemed = cycle % 2 === 1;
      return {
        ...common,
        session_id: `consumer-b-${sessionBase}`,
        consumer_value: "consumer-b-scripted",
        sequence: 2,
        request: redeemed
          ? request("GET", "/orders/order_01")
          : request("GET", "/search", { q: "full-price" }),
        response: redeemed
          ? response(200, { id: "order_01", status: "processing", total_cents: 4200 })
          : response(200, { data: [] }),
      };
    }
    case 4:
      return {
        ...common,
        session_id: `consumer-c-${sessionBase}`,
        consumer_value: "consumer-c-scripted",
        sequence: 1,
        request: request("GET", "/customers/cust_01"),
        response: response(200, {
          id: "cust_01",
          name: "Demo customer",
          legacy_id: "legacy-cust_01",
        }),
      };
    case 5:
      return {
        ...common,
        session_id: `hard-negative-${sessionBase}`,
        consumer_value: "consumer-negative-scripted",
        sequence: 1,
        request: request("GET", "/inventory/prod_01"),
        response: response(200, { sku: "prod_01", available: 18 }),
      };
    case 6:
      return {
        ...common,
        session_id: `consumer-a2-${sessionBase}`,
        consumer_value: "consumer-a-scripted",
        sequence: 1,
        request: request("GET", "/products"),
        response: response(200, { data: [{ id: "prod_01" }], next_cursor: "page-2" }),
      };
    case 7:
      return {
        ...common,
        session_id: `consumer-a2-${sessionBase}`,
        consumer_value: "consumer-a-scripted",
        sequence: 2,
        request: request("GET", "/products", { cursor: "page-2" }),
        response: response(200, { data: [{ id: "prod_03" }] }),
      };
    case 8:
      return {
        ...common,
        session_id: `normal-${sessionBase}`,
        consumer_value: "consumer-normal-scripted",
        sequence: 1,
        request: request("GET", "/products/prod_01"),
        response: response(200, { id: "prod_01", name: "Orbit mug", price_cents: 2400 }),
      };
    default:
      return {
        ...common,
        session_id: `normal-${sessionBase}`,
        consumer_value: "consumer-normal-scripted",
        sequence: 2,
        request: request("GET", "/orders/order_01"),
        response: response(200, { id: "order_01", status: "processing", total_cents: 4200 }),
      };
  }
}

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
const gzip = createGzip({ level: 9, mtime: 0 });
const output = createWriteStream(temporaryPath, { flags: "wx" });
gzip.pipe(output);
const digest = createHash("sha256");

for (let index = 0; index < count; index += 1) {
  const line = `${JSON.stringify(event(Math.floor(index / 10), index % 10))}\n`;
  digest.update(line);
  if (!gzip.write(line)) await once(gzip, "drain");
}
gzip.end();
await once(output, "close");
await rename(temporaryPath, outputPath);

const manifest = {
  version: "1.0.0",
  organization_id: organizationId,
  record_count: count,
  uncompressed_sha256: digest.digest("hex"),
  generated_by: "demo/consumers/generate.mjs",
  consumers: {
    "consumer-a-scripted": {
      tier: "T1",
      behavior: "response next_cursor echoed as request cursor",
    },
    "consumer-b-scripted": {
      tier: "T2",
      behavior: "different request branches follow two 422 error templates",
    },
    "consumer-c-scripted": { tier: "T3", behavior: "legacy_id exposure only" },
    "consumer-negative-scripted": { tier: "none", behavior: "hard negative" },
  },
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "w" });
process.stdout.write(`${JSON.stringify({ output: outputPath, ...manifest })}\n`);
