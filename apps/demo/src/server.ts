import { buildDemoApp, readVariant } from "./app";

const app = buildDemoApp(readVariant(process.env.DEMO_VARIANT));
const port = Number(process.env.PORT ?? 4100);
await app.listen({ host: "0.0.0.0", port });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
