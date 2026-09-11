import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { verifyRoutes } from "./routes/verify";
import { initSchema } from "./db";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(verifyRoutes);

  app.get("/healthz", async () => ({ ok: true }));

  await initSchema();

  const port = Number(process.env.PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`sVerify API listening on :${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
