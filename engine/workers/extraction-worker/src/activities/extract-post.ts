import { randomUUID } from "node:crypto";
import { ApplicationFailure } from "@temporalio/activity";
import type { ExtractedPost, ExtractionErrorCode, Platform } from "@sverify/schemas";
import {
  s3ClientFromEnv,
  putObjectBuffer,
  MEDIA_BUCKET,
  extractPostViaSidecar,
  ExtractionSidecarError,
} from "@sverify/clients";
import { mockExtractedPost } from "@sverify/mocks";

const s3 = s3ClientFromEnv();

/**
 * Extracts a public post's text/author/media by delegating all platform
 * scraping (yt-dlp, syndication APIs, URL/path validation, ...) to the
 * standalone extraction-sidecar service, then downloads whatever media
 * URLs it returns and uploads them to S3/MinIO.
 *
 * This activity intentionally knows nothing about *how* a given platform
 * is scraped - that lives entirely in apps/extraction-sidecar, which can be
 * developed, deployed, and scaled independently of the Temporal workers.
 *
 * When `mock` is true, skips the sidecar and S3 entirely and returns canned
 * data - this is what powers the `x-mock: true` API header end to end.
 */
export async function extractPost(input: { url: string; mock: boolean }): Promise<ExtractedPost> {
  const { url, mock } = input;

  if (mock) {
    // Mock mode still needs a platform label; sidecar-side validation logic
    // is intentionally not duplicated here, so just sniff the hostname.
    return mockExtractedPost(detectPlatformForMock(url), url);
  }

  try {
    const extracted = await extractPostViaSidecar(url);

    const [videoKey, imageKeys] = await Promise.all([
      extracted.video ? downloadAndUpload(extracted.video, `videos/${extracted.platform}`) : Promise.resolve(null),
      Promise.all(
        extracted.images.map((imageUrl) => downloadAndUpload(imageUrl, `images/${extracted.platform}`))
      ).then((keys) => keys.filter((k): k is string => k !== null)),
    ]);

    return {
      platform: extracted.platform,
      postUrl: extracted.postUrl,
      author: extracted.author,
      text: extracted.text,
      imageKeys,
      videoKey,
    };
  } catch (err) {
    throw toApplicationFailure(err, url);
  }
}

function detectPlatformForMock(url: string): Platform {
  if (/facebook\.com/.test(url)) return "facebook";
  if (/instagram\.com/.test(url)) return "instagram";
  return "x";
}

/** Downloads a media URL and uploads it to S3 under `prefix/`; returns the S3 key, or null on failure. */
async function downloadAndUpload(mediaUrl: string, prefix: string): Promise<string | null> {
  try {
    const res = await fetch(mediaUrl);
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? guessContentType(mediaUrl);
    const ext = extFromContentType(contentType) ?? extFromUrl(mediaUrl) ?? "bin";

    const key = `${prefix}/${randomUUID()}.${ext}`;
    await putObjectBuffer(s3, MEDIA_BUCKET, key, buffer, contentType);
    return key;
  } catch {
    // A single piece of media failing to download isn't fatal for the post.
    return null;
  }
}

function extFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = contentType.match(/\/(\w+)/);
  if (!match) return null;
  return match[1] === "jpeg" ? "jpg" : match[1];
}

function extFromUrl(url: string): string | null {
  const match = url.match(/\.(\w{2,4})(?:$|\?)/);
  return match ? match[1].toLowerCase() : null;
}

function guessContentType(url: string): string {
  const ext = extFromUrl(url) ?? "bin";
  if (["mp4", "mov", "webm"].includes(ext)) return `video/${ext}`;
  return `image/${ext === "jpg" ? "jpeg" : ext}`;
}

function toApplicationFailure(err: unknown, url: string): ApplicationFailure {
  if (err instanceof ExtractionSidecarError) {
    return ApplicationFailure.create({ type: err.code as ExtractionErrorCode, message: err.message });
  }
  return ApplicationFailure.create({
    type: "EXTRACTION_FAILED",
    message: `Failed to extract post ${url}: ${err instanceof Error ? err.message : String(err)}`,
  });
}
