import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const configurationSchema = z.object({
  baseUrl: z.string().url(),
  output: z.string().min(1),
  requestCount: z.number().int().min(100).max(1_000_000),
});
const configuration = configurationSchema.parse({
  baseUrl: process.env.DEMO_BASE_URL ?? "http://127.0.0.1:4100",
  output: resolve(process.env.DEMO_CAPTURE_OUTPUT ?? ".hyrum-demo/capture.ndjson"),
  requestCount: Number(process.env.DEMO_REQUESTS ?? 50_000),
});

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface Exchange {
  timestamp: string;
  sequence: number;
  operation_key: string;
  consumer_identity: string;
  correlation_id: string;
  recent_request_count: number;
  request: { method: string; path: string; query?: Record<string, Json>; body?: Json };
  response: { status: number; headers: Record<string, string[]>; body: Json };
}

await mkdir(dirname(configuration.output), { recursive: true });
const output = await open(configuration.output, "w", 0o600);
let written = 0;
let sessionNumber = 0;

async function capture(
  consumer: "consumer-a-script" | "consumer-b-script" | "consumer-c-script" | "background-script",
  correlationId: string,
  sequence: number,
  method: "GET" | "POST",
  path: string,
  operationKey: string,
  options: { query?: Record<string, Json>; body?: Json } = {},
): Promise<{ status: number; body: Json }> {
  const url = new URL(path, configuration.baseUrl);
  for (const [key, value] of Object.entries(options.query ?? {}))
    url.searchParams.set(key, String(value));
  const response = await fetch(
    url,
    options.body
      ? {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : { method },
  );
  const body = (await response.json()) as Json;
  const exchange: Exchange = {
    timestamp: new Date(1_750_000_000_000 + written * 10).toISOString(),
    sequence,
    operation_key: operationKey,
    consumer_identity: consumer,
    correlation_id: correlationId,
    recent_request_count: configuration.requestCount,
    request: { method, path, ...options },
    response: {
      status: response.status,
      headers: { "content-type": [response.headers.get("content-type") ?? "application/json"] },
      body,
    },
  };
  await output.write(`${JSON.stringify(exchange)}\n`);
  written++;
  return { status: response.status, body };
}

while (written < configuration.requestCount) {
  const correlationId = `scripted-session-${sessionNumber++}`;
  const mode = sessionNumber % 10;
  if (mode < 4 && written + 2 <= configuration.requestCount) {
    // Scripted consumer A creates T1 evidence by echoing the undocumented cursor.
    const first = await capture(
      "consumer-a-script",
      correlationId,
      1,
      "GET",
      "/orders",
      "get-orders",
    );
    const cursor =
      typeof first.body === "object" && first.body && !Array.isArray(first.body)
        ? first.body.next_cursor
        : null;
    await capture("consumer-a-script", correlationId, 2, "GET", "/orders", "get-orders", {
      query: { cursor: typeof cursor === "string" ? cursor : "missing-next-cursor" },
    });
  } else if (mode < 8 && written + 2 <= configuration.requestCount) {
    // Scripted consumer B retries only for one of two same-status error templates.
    const coupon = sessionNumber % 2 === 0 ? "EXPIRED" : "INVALID";
    const first = await capture(
      "consumer-b-script",
      correlationId,
      1,
      "POST",
      "/checkout",
      "post-checkout",
      {
        body: { coupon },
      },
    );
    const message =
      typeof first.body === "object" && first.body && !Array.isArray(first.body)
        ? first.body.message
        : null;
    if (
      message === "Coupon expired; retry checkout without it" &&
      written < configuration.requestCount
    ) {
      await capture("consumer-b-script", correlationId, 2, "POST", "/checkout", "post-checkout", {
        body: {},
      });
    }
  } else if (mode === 8) {
    // Scripted consumer C observes legacy_id but never uses it, so it remains T3 exposure.
    await capture(
      "consumer-c-script",
      correlationId,
      1,
      "GET",
      "/customers/customer_1",
      "get-customer",
    );
  } else {
    await capture("background-script", correlationId, 1, "GET", "/products", "list-products");
  }
}

await output.close();
process.stdout.write(
  `${JSON.stringify({ output: configuration.output, requests: written, consumers: ["A (scripted)", "B (scripted)", "C (scripted)"] })}\n`,
);
