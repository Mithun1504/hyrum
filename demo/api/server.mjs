import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const json = (response, status, body) => {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(payload);
};

const products = [
  { id: "prod_01", name: "Orbit mug", price_cents: 2400 },
  { id: "prod_02", name: "Field notebook", price_cents: 1800 },
  { id: "prod_03", name: "Signal lamp", price_cents: 8900 },
  { id: "prod_04", name: "Relay clock", price_cents: 12500 },
];

function productPage(url, variant) {
  const cursor = url.searchParams.get("cursor");
  const start = cursor === "page-2" ? 2 : 0;
  const body = { data: products.slice(start, start + 2) };
  if (start === 0) body[variant === "candidate" ? "cursor" : "next_cursor"] = "page-2";
  return body;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error("request body exceeds 16 KiB");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createDemoServer({ variant = "base" } = {}) {
  if (!new Set(["base", "candidate"]).has(variant)) {
    throw new Error("variant must be base or candidate");
  }

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://demo.local");
      const method = request.method ?? "GET";

      if (method === "GET" && url.pathname === "/health") {
        return json(response, 200, { status: "ok", variant });
      }
      if (method === "GET" && url.pathname === "/products") {
        return json(response, 200, productPage(url, variant));
      }
      if (method === "GET" && /^\/products\/[^/]+$/.test(url.pathname)) {
        const product = products.find(({ id }) => id === url.pathname.split("/").at(-1));
        return product
          ? json(response, 200, product)
          : json(response, 404, { error: "product not found" });
      }
      if (method === "GET" && /^\/orders\/[^/]+$/.test(url.pathname)) {
        return json(response, 200, {
          id: url.pathname.split("/").at(-1),
          status: "processing",
          total_cents: 4200,
        });
      }
      if (method === "GET" && /^\/customers\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split("/").at(-1);
        return json(response, 200, { id, name: "Demo customer", legacy_id: `legacy-${id}` });
      }
      if (method === "GET" && /^\/inventory\/[^/]+$/.test(url.pathname)) {
        return json(response, 200, { sku: url.pathname.split("/").at(-1), available: 18 });
      }
      if (method === "GET" && url.pathname === "/search") {
        const query = url.searchParams.get("q")?.toLowerCase() ?? "";
        return json(response, 200, {
          data: products.filter(({ name }) => name.toLowerCase().includes(query)),
        });
      }
      if (method === "GET" && /^\/discounts\/[^/]+$/.test(url.pathname)) {
        const code = url.pathname.split("/").at(-1);
        const error =
          variant === "candidate"
            ? `invalid discount code: ${code}`
            : `coupon code invalid: ${code}`;
        return json(response, 422, { error });
      }
      if (method === "POST" && url.pathname === "/checkout") {
        const body = await readBody(request);
        if (!Array.isArray(body.items) || body.items.length === 0) {
          return json(response, 422, { error: "checkout requires at least one item" });
        }
        return json(response, 201, { id: "order_demo", status: "processing" });
      }
      return json(response, 404, { error: "route not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      return json(response, message.includes("16 KiB") ? 413 : 400, { error: message });
    }
  });
}

export async function startDemoServer({
  variant = process.env.DEMO_VARIANT ?? "base",
  port = Number(process.env.PORT ?? 4100),
  host = process.env.HOST ?? "127.0.0.1",
} = {}) {
  const server = createDemoServer({ variant });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const server = await startDemoServer();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : "unknown";
  process.stdout.write(
    `Hyrum demo API listening on http://${process.env.HOST ?? "127.0.0.1"}:${port}\n`,
  );
}
