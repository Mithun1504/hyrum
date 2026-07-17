import { afterEach, describe, expect, it } from "vitest";
import { buildDemoApp } from "./app";

const apps: ReturnType<typeof buildDemoApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("demo API", () => {
  it("exposes exactly eight route families", async () => {
    const app = buildDemoApp();
    apps.push(app);
    await app.ready();
    const routes = [
      ["GET", "/health"],
      ["GET", "/products"],
      ["GET", "/products/:id"],
      ["GET", "/orders"],
      ["POST", "/orders"],
      ["GET", "/orders/:id"],
      ["POST", "/checkout"],
      ["GET", "/customers/:id"],
    ] as const;
    expect(routes.every(([method, url]) => app.hasRoute({ method, url }))).toBe(true);
  });

  it("makes the two candidate breaks deterministic", async () => {
    const base = buildDemoApp("base");
    const candidate = buildDemoApp("candidate");
    apps.push(base, candidate);
    const [baseOrders, candidateOrders, baseError, candidateError] = await Promise.all([
      base.inject({ method: "GET", url: "/orders" }),
      candidate.inject({ method: "GET", url: "/orders" }),
      base.inject({ method: "POST", url: "/checkout", payload: { coupon: "EXPIRED" } }),
      candidate.inject({ method: "POST", url: "/checkout", payload: { coupon: "EXPIRED" } }),
    ]);
    expect(baseOrders.json()).toHaveProperty("next_cursor");
    expect(candidateOrders.json()).toHaveProperty("cursor");
    expect(baseError.json()).not.toEqual(candidateError.json());
    expect(baseError.statusCode).toBe(422);
    expect(candidateError.statusCode).toBe(422);
  });
});
