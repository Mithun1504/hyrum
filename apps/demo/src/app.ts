import Fastify from "fastify";
import { z } from "zod";

const variantSchema = z.enum(["base", "candidate"]);
export type DemoVariant = z.infer<typeof variantSchema>;

const products = [
  { id: "prod_1", name: "Mechanical keyboard", price: 12900 },
  { id: "prod_2", name: "USB-C dock", price: 8900 },
];

export function buildDemoApp(variant: DemoVariant = "base") {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

  app.get("/health", async () => ({ status: "ok", variant }));
  app.get("/products", async () => ({ products }));
  app.get<{ Params: { id: string } }>("/products/:id", async (request, reply) => {
    const product = products.find((item) => item.id === request.params.id);
    return product ?? reply.code(404).send({ code: "not_found", message: "Product not found" });
  });
  app.get<{ Querystring: { cursor?: string } }>("/orders", async (request) => {
    const page = request.query.cursor ? 2 : 1;
    const pagination =
      page === 1 ? { [variant === "base" ? "next_cursor" : "cursor"]: "page_2" } : {};
    return { orders: [{ id: `order_${page}`, total: page * 4200 }], ...pagination };
  });
  app.post<{ Body: { productId?: string; quantity?: number } }>(
    "/orders",
    async (request, reply) => {
      if (!request.body?.productId || !request.body.quantity) {
        return reply
          .code(400)
          .send({ code: "invalid_order", message: "Product and quantity are required" });
      }
      return reply.code(201).send({ id: "order_new", status: "pending" });
    },
  );
  app.get<{ Params: { id: string } }>("/orders/:id", async (request) => ({
    id: request.params.id,
    status: "ready",
    total: 4200,
  }));
  app.post<{ Body: { coupon?: string } }>("/checkout", async (request, reply) => {
    const coupon = request.body?.coupon;
    if (coupon === "EXPIRED") {
      return reply.code(422).send({
        code: "coupon_error",
        message:
          variant === "base"
            ? "Coupon expired; retry checkout without it"
            : "This promotion is no longer available",
      });
    }
    if (coupon === "INVALID") {
      return reply.code(422).send({ code: "coupon_error", message: "Coupon is invalid" });
    }
    return { checkoutId: "checkout_1", status: "accepted" };
  });
  app.get<{ Params: { id: string } }>("/customers/:id", async (request) => ({
    id: request.params.id,
    display_name: "Demo customer",
    legacy_id: "customer-legacy-42",
  }));

  return app;
}

export function readVariant(value: string | undefined): DemoVariant {
  return variantSchema.parse(value ?? "base");
}
