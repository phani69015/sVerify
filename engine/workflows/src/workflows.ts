import { proxyActivities, ApplicationFailure, log } from "@temporalio/workflow";
import type {
  ExtractedPost,
  MediaAnalysisResult,
  ClaimVerificationResult,
  VerificationResult,
} from "@sverify/schemas";
import type {
  ExtractionActivities,
  MlActivities,
  LlmActivities,
  IoActivities,
} from "./activities";
import { TASK_QUEUES } from "./activities";
import { computeOverallRisk } from "./risk-engine";

/**
 * The verification pipeline, end to end:
 *
 *   extractPost                       (extraction-tq)
 *        │
 *        ├──> detectDeepfake            ─┐  run concurrently, only if a video
 *        └──> transcribeAudio  (ml-tq)  ─┘  was found in the post
 *        │
 *        v
 *   extractClaims                     (llm-tq)
 *        │
 *        v
 *   for each claim, concurrently:
 *        searchEvidence  (llm-tq)  ──>  verifyClaim  (llm-tq)
 *        │
 *        v
 *   computeOverallRisk()              <- pure function, runs inline, no activity
 *        │
 *        v
 *   persistResult                     (io-tq)
 *
 * Every step above is a Temporal Activity except `computeOverallRisk`, which
 * is plain deterministic TypeScript and therefore safe to run directly
 * inside the workflow. Each group of activities is implemented by a
 * different worker process - see `engine/workflows/src/activities.ts` for
 * exactly which worker owns which activity, and what its retry/timeout
 * policy is.
 */

// ---------------------------------------------------------------------------
// Activity proxies - one per task queue, each carrying that queue's own
// timeout/retry policy. Calling e.g. `ml.detectDeepfake(...)` below is a
// full round trip through the Temporal server to whichever worker owns
// `ml-tq` - see the sVerify architecture docs for how this dispatch works.
// ---------------------------------------------------------------------------

const extraction = proxyActivities<ExtractionActivities>({
  taskQueue: TASK_QUEUES.EXTRACTION,
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 3,
    // Real-world failure modes (post is private/deleted/invalid) that will
    // never succeed on retry - fail fast instead of wasting time.
    nonRetryableErrorTypes: [
      "INVALID_URL",
      "UNSUPPORTED_PLATFORM",
      "PRIVATE_OR_LOGIN_REQUIRED",
      "DELETED_OR_NOT_FOUND",
    ],
  },
});

const ml = proxyActivities<MlActivities>({
  taskQueue: TASK_QUEUES.ML,
  startToCloseTimeout: "5 minutes", // video download + model inference can be slow
  heartbeatTimeout: "30 seconds", // detects a crashed worker mid-inference
  retry: { maximumAttempts: 3 },
});

const llm = proxyActivities<LlmActivities>({
  taskQueue: TASK_QUEUES.LLM,
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 5, backoffCoefficient: 2 }, // LLM/search APIs are rate-limited
});

const io = proxyActivities<IoActivities>({
  taskQueue: TASK_QUEUES.IO,
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 5 },
});

// ---------------------------------------------------------------------------
// Workflow entry point
// ---------------------------------------------------------------------------

export interface VerificationWorkflowInput {
  analysisId: string;
  url: string;
  /** When true, every activity returns canned data instead of doing real I/O. */
  mock: boolean;
}

export async function verificationWorkflow(
  input: VerificationWorkflowInput,
): Promise<VerificationResult> {
  const { analysisId, url, mock } = input;

  try {
    const post = await extraction.extractPost({ url, mock });
    const media = await analyzeMedia(post, mock);
    const claims = await verifyAllClaims(post, media.transcript, mock);
    const overallRisk = computeOverallRisk(media.result, claims);

    const result: VerificationResult = {
      analysisId,
      platform: post.platform,
      status: "COMPLETE",
      media: media.result,
      claims,
      overallRisk,
      explanation: buildExplanation(media.result, claims, overallRisk),
      errorCode: null,
      errorMessage: null,
    };

    await io.persistResult({
      analysisId,
      url,
      resultJson: JSON.stringify(result),
    });
    return result;
  } catch (err) {
    return await handleFailure(analysisId, url, err);
  }
}

// ---------------------------------------------------------------------------
// Pipeline steps, in the order verificationWorkflow calls them
// ---------------------------------------------------------------------------

/**
 * Media analysis - deepfake/AI-generated detection, plus audio transcription
 * when there's a video to transcribe.
 *
 *   video post:       detectDeepfake samples frames from the video + transcribeAudio
 *   image-only post:  detectDeepfake classifies each image directly, no transcript
 *   text-only post:   skipped entirely - not an error, just nothing to analyze
 */
async function analyzeMedia(
  post: ExtractedPost,
  mock: boolean,
): Promise<{ result: MediaAnalysisResult | null; transcript: string }> {
  if (post.videoKey) {
    const [result, transcript] = await Promise.all([
      ml.detectDeepfake({ videoKey: post.videoKey, imageKeys: [], mock }),
      ml.transcribeAudio({ videoKey: post.videoKey, mock }),
    ]);
    return { result, transcript: transcript.text };
  }

  if (post.imageKeys.length > 0) {
    const result = await ml.detectDeepfake({
      videoKey: null,
      imageKeys: post.imageKeys,
      mock,
    });
    return { result, transcript: "" };
  }

  return { result: null, transcript: "" };
}

/**
 * Extracts claims from caption + transcript, then for each claim fetches
 * evidence and gets a verdict. Claims are verified concurrently with each
 * other (each claim's own search -> verify is sequential, but different
 * claims don't wait on each other).
 */
async function verifyAllClaims(
  post: ExtractedPost,
  transcript: string,
  mock: boolean,
): Promise<ClaimVerificationResult[]> {
  const claims = await llm.extractClaims({ text: post.text, transcript, mock });

  return Promise.all(
    claims.map(async (claim) => {
      const evidence = await llm.searchEvidence({ claim: claim.text, mock });
      return llm.verifyClaim({ claim: claim.text, evidence, mock });
    }),
  );
}

// ---------------------------------------------------------------------------
// Failure path
// ---------------------------------------------------------------------------

/**
 * Any non-retryable extraction error, or any activity that exhausted its
 * retries, ends up here. Persists a FAILED result (so Postgres reflects it
 * too) and re-throws so the workflow itself is recorded as FAILED in
 * Temporal - never silently returning a fabricated success.
 */
async function handleFailure(
  analysisId: string,
  url: string,
  err: unknown,
): Promise<never> {
  log.error("verificationWorkflow failed", { analysisId, url, error: err });

  const failure: VerificationResult = {
    analysisId,
    platform: guessPlatformFromUrl(url),
    status: "FAILED",
    media: null,
    claims: [],
    overallRisk: null,
    explanation: null,
    errorCode: errorCodeFromException(err),
    errorMessage: err instanceof Error ? err.message : String(err),
  };

  await io.persistResult({
    analysisId,
    url,
    resultJson: JSON.stringify(failure),
  });
  throw err;
}

// ---------------------------------------------------------------------------
// Small result-building helpers
// ---------------------------------------------------------------------------

function buildExplanation(
  media: MediaAnalysisResult | null,
  claims: ClaimVerificationResult[],
  risk: NonNullable<VerificationResult["overallRisk"]>,
): string {
  const parts: string[] = [];

  if (media) {
    parts.push(
      `Media classified as ${media.classification} (${Math.round(media.confidence * 100)}% confidence).`,
    );
  }

  const contradicted = claims.filter(
    (c) => c.verdict === "CONTRADICTED",
  ).length;
  if (contradicted > 0) {
    parts.push(`${contradicted} claim(s) contradicted by evidence.`);
  }

  parts.push(`Overall risk: ${risk}.`);
  return parts.join(" ");
}

function guessPlatformFromUrl(url: string): VerificationResult["platform"] {
  if (url.includes("facebook.com")) return "facebook";
  if (url.includes("instagram.com")) return "instagram";
  return "x";
}

function errorCodeFromException(err: unknown): VerificationResult["errorCode"] {
  if (err instanceof ApplicationFailure && err.type) {
    return err.type as VerificationResult["errorCode"];
  }
  return "EXTRACTION_FAILED";
}
