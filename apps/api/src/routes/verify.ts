import type { FastifyInstance, FastifyRequest } from "fastify";
import { nanoid } from "nanoid";
import { VerifyRequestSchema, type VerificationResult } from "@sverify/schemas";
import { TASK_QUEUES, verificationWorkflow } from "@sverify/temporal-workflows";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { redisClientFromEnv, verificationCacheKey, getCachedJSON } from "@sverify/clients";
import { getTemporalClient } from "../temporal-client";
import { getAnalysis, insertCompletedAnalysis, insertPendingAnalysis } from "../db";

const redis = redisClientFromEnv();

/**
 * True when the caller sent `x-mock: true`. In mock mode every worker
 * activity (extraction, deepfake detection, transcription, claim extraction,
 * evidence search, verification) skips real I/O and returns canned demo
 * data - useful for testing the full pipeline without yt-dlp/ffmpeg/Hugging
 * Face endpoints configured.
 */
function isMockRequest(req: FastifyRequest): boolean {
  return req.headers["x-mock"] === "true";
}

export async function verifyRoutes(app: FastifyInstance) {
  app.post("/api/v1/verify", async (req, reply) => {
    const parsed = VerifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });
    }

    const { url } = parsed.data;
    const mock = isMockRequest(req);
    const analysisId = nanoid(16);

    // Cache hit: same URL has already completed a real verification recently
    // (see io-worker's persistResult) - skip the pipeline entirely and hand
    // back a fresh analysisId wrapping the cached result. Never served for
    // mock requests, which are canned/instant anyway and shouldn't pollute
    // (or be served from) the real cache.
    if (!mock) {
      const cached = await getCachedJSON<VerificationResult>(redis, verificationCacheKey(url));
      if (cached) {
        const result: VerificationResult = { ...cached, analysisId };
        await insertCompletedAnalysis(analysisId, url, JSON.stringify(result));
        app.log.info({ url, analysisId }, "verify cache hit - skipped pipeline");
        return reply.status(202).send({ analysisId });
      }
    }

    const workflowId = buildWorkflowId(url, analysisId);

    const started = await startWorkflow(workflowId, { analysisId, url, mock });
    if (!started.ok) {
      app.log.error(started.error);
      return reply.status(502).send({ error: "WORKFLOW_START_FAILED" });
    }

    await insertPendingAnalysis(analysisId, url, workflowId);
    return reply.status(202).send({ analysisId });
  });

  app.get("/api/v1/verify/:analysisId", async (req, reply) => {
    const { analysisId } = req.params as { analysisId: string };

    const analysis = await getAnalysis(analysisId);
    if (!analysis) {
      return reply.status(404).send({ error: "NOT_FOUND" });
    }

    // Terminal states (COMPLETE/FAILED) are already fully persisted with the
    // exact response shape by io-worker's persistResult - serve directly from
    // Postgres instead of re-querying an already-finished (or, for cache
    // hits, nonexistent) Temporal workflow on every poll.
    if (analysis.status === "COMPLETE" || analysis.status === "FAILED") {
      return reply.send(analysis.result);
    }

    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(analysis.workflow_id);
    const { status } = await handle.describe();

    switch (status.name) {
      case "COMPLETED":
        return reply.send(await handle.result());
      case "FAILED":
      case "TERMINATED":
      case "TIMED_OUT":
        // The workflow itself already persisted the specific errorCode to
        // Postgres before failing - read it back rather than guessing here.
        return reply.send({
          analysisId,
          status: "FAILED",
          errorCode: analysis.result?.errorCode ?? "EXTRACTION_FAILED",
        });
      default:
        return reply.send({ analysisId, status: "PROCESSING" });
    }
  });
}

/** Deterministic workflow ID from the URL, so duplicate submissions of the same
 *  URL reuse the same workflow instead of double-processing. */
function buildWorkflowId(url: string, analysisId: string): string {
  const urlHash = Buffer.from(url).toString("base64url").slice(0, 32);
  return `verify-${urlHash}-${analysisId}`;
}

async function startWorkflow(
  workflowId: string,
  args: { analysisId: string; url: string; mock: boolean }
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    const client = await getTemporalClient();
    await client.workflow.start(verificationWorkflow, {
      workflowId,
      taskQueue: TASK_QUEUES.ORCHESTRATION,
      args: [args],
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      return { ok: true }; // duplicate submission of the same URL - fine, reuse it
    }
    return { ok: false, error: err };
  }
}
