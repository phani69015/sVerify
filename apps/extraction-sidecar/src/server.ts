import "dotenv/config";
import Fastify from "fastify";
import { ExtractionSidecarRequestSchema } from "@sverify/schemas";
import { extract } from "./extract";
import { ExtractionError, ERROR_HTTP_STATUS } from "./errors";

async function main() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.post("/extract", async (req, reply) => {
    const parsed = ExtractionSidecarRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_URL", message: "Body must be { url: string }" });
    }

    try {
      const result = await extract(parsed.data.url);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof ExtractionError) {
        req.log.warn({ url: parsed.data.url, code: err.code }, err.message);
        return reply.status(ERROR_HTTP_STATUS[err.code]).send({ code: err.code, message: err.message });
      }

      req.log.error(err, `Unexpected extraction error for ${parsed.data.url}`);
      return reply.status(502).send({
        code: "EXTRACTION_FAILED",
        message: err instanceof Error ? err.message : "Unknown extraction error",
      });
    }
  });

  const port = Number(process.env.PORT ?? 4200);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`sVerify extraction-sidecar listening on :${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
