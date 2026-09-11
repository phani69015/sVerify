import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@temporalio/activity";
import { s3ClientFromEnv, getObjectBuffer, MEDIA_BUCKET, hfClientFromEnv, type HfClient } from "@sverify/clients";
import type { MediaAnalysisResult, MediaClassification } from "@sverify/schemas";
import { mockDeepfakeResult } from "@sverify/mocks";
import { sampleFrames } from "../frame-sampling";
import { aggregateFrameClassifications, type FrameClassification } from "../aggregate-frames";

const s3 = s3ClientFromEnv();

interface HfLabelScore {
  label: string; // e.g. "real" | "fake" | "ai_generated"
  score: number;
}

/** One image to classify, with the content-type the HF endpoint needs to decode it. */
interface ClassifiableImage {
  buffer: Buffer;
  contentType: string;
}

/**
 * Classifies a post's media as authentic/manipulated/AI-generated via a
 * Hugging Face Inference Endpoint. Works for both video posts (samples a
 * handful of frames) and image posts (classifies each image directly) -
 * the underlying HF endpoint is a plain image classifier either way, so a
 * "frame" and a standalone post image are the same kind of request to it.
 *
 * Each image/frame is sent as its own binary request (raw image bytes,
 * `Content-Type: image/...`) - the standard shape for an HF image
 * classification endpoint - run concurrently, then aggregated into one
 * verdict. We deliberately do NOT batch multiple images into a single JSON
 * payload (e.g. `{ frames: [base64, ...] }`); most deployed image
 * classifiers only accept one raw image per request, and that's the shape
 * that's actually reliable here.
 *
 * Pass exactly one of `videoKey` / `imageKeys`, matching whatever media the
 * post actually has (see ExtractedPost). If neither is present (a
 * text-only post), returns UNABLE_TO_DETERMINE without calling anything.
 */
export async function detectDeepfake(input: {
  videoKey: string | null;
  imageKeys: string[];
  mock: boolean;
}): Promise<MediaAnalysisResult> {
  if (input.mock) return mockDeepfakeResult();

  const images = await resolveClassifiableImages(input);
  return classifyImages(images);
}

/**
 * Resolves whatever media the post has down to a flat list of images to
 * classify - sampled frames for a video, or the images themselves for an
 * image post. Returns an empty list for a text-only post (no videoKey, no
 * imageKeys), which classifyImages then turns into UNABLE_TO_DETERMINE.
 */
async function resolveClassifiableImages(input: {
  videoKey: string | null;
  imageKeys: string[];
}): Promise<ClassifiableImage[]> {
  if (input.videoKey) {
    const frames = await withTempVideo(input.videoKey, (videoPath) => {
      Context.current().heartbeat("sampling frames");
      return sampleFrames(videoPath);
    });
    return frames.map((buffer) => ({ buffer, contentType: "image/jpeg" })); // frame-sampling always outputs jpg
  }

  if (input.imageKeys.length > 0) {
    Context.current().heartbeat(`downloading ${input.imageKeys.length} image(s)`);
    return Promise.all(
      input.imageKeys.map(async (key) => ({
        buffer: await getObjectBuffer(s3, MEDIA_BUCKET, key),
        contentType: contentTypeFromKey(key),
      }))
    );
  }

  return [];
}

function contentTypeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

async function withTempVideo<T>(videoKey: string, fn: (videoPath: string) => Promise<T>): Promise<T> {
  const videoPath = join(tmpdir(), `${randomUUID()}.mp4`);
  try {
    Context.current().heartbeat("downloading video");
    const videoBuffer = await getObjectBuffer(s3, MEDIA_BUCKET, videoKey);
    await writeFile(videoPath, videoBuffer);
    return await fn(videoPath);
  } finally {
    await unlink(videoPath).catch(() => undefined);
  }
}

/** Classifies every image with its own concurrent HF request, then aggregates the results. */
async function classifyImages(images: ClassifiableImage[]): Promise<MediaAnalysisResult> {
  if (images.length === 0) {
    return { classification: "UNABLE_TO_DETERMINE", confidence: 0 };
  }

  Context.current().heartbeat(`calling HF deepfake endpoint for ${images.length} image(s), concurrently`);
  const client = hfClientFromEnv("HF_DEEPFAKE_ENDPOINT_URL");

  const perImage = await Promise.all(images.map((image) => classifyOneImage(client, image)));
  return aggregateFrameClassifications(perImage);
}

async function classifyOneImage(client: HfClient, image: ClassifiableImage): Promise<FrameClassification> {
  const response = await client.postBinary<unknown>(image.buffer, image.contentType);
  return parseSingleImageResponse(response);
}

/**
 * The exact response shape depends on how the deepfake model is deployed on
 * Hugging Face, and different deployments commonly return different
 * wrappers for a single image's prediction. This defensively handles the
 * shapes we're likely to see instead of assuming one fixed contract:
 *
 *   [{label, score}, ...]                  - top-k predictions, standard HF
 *                                             image-classification pipeline output
 *   {label, score}                          - a single top-1 prediction
 *   {predictions: [...]} / {frames: [...]}  - wrapped in a container object
 *
 * When there's more than one candidate (top-k), the highest-scoring one wins.
 */
function parseSingleImageResponse(response: unknown): FrameClassification {
  const candidates = flattenLabelScores(response);

  if (candidates.length === 0) {
    throw new Error(`Unexpected deepfake endpoint response shape: ${JSON.stringify(response).slice(0, 300)}`);
  }

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  return { classification: mapLabel(best.label), confidence: best.score };
}

function flattenLabelScores(value: unknown): HfLabelScore[] {
  const unwrapped = unwrapContainer(value);

  if (Array.isArray(unwrapped)) {
    return unwrapped.filter(isLabelScore);
  }

  return isLabelScore(unwrapped) ? [unwrapped] : [];
}

function unwrapContainer(response: unknown): unknown {
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const obj = response as Record<string, unknown>;
    if (Array.isArray(obj.predictions)) return obj.predictions;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return response;
}

function isLabelScore(value: unknown): value is HfLabelScore {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).label === "string" &&
    typeof (value as Record<string, unknown>).score === "number"
  );
}

function mapLabel(label: string): MediaClassification {
  const normalized = label.toLowerCase();
  if (normalized.includes("ai") || normalized.includes("generated")) return "AI_GENERATED";
  if (normalized.includes("fake") || normalized.includes("manipulat")) return "POTENTIALLY_MANIPULATED";
  if (normalized.includes("real") || normalized.includes("authentic")) return "AUTHENTIC";
  return "UNABLE_TO_DETERMINE";
}
