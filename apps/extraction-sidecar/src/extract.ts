import type { ExtractionSidecarResponse, Platform } from "@sverify/schemas";
import { extractTwitterPost } from "./platforms/x";
import { extractViaYtDlp } from "./platforms/ytdlp";
import { parsePostUrl } from "./url";

/**
 * One extractor per platform. X/Twitter has a nicer public API (syndication)
 * so it gets its own module; Instagram and Facebook share the generic
 * yt-dlp-backed extractor, parameterized by platform.
 */
const EXTRACTORS: Record<Platform, (url: string) => Promise<ExtractionSidecarResponse>> = {
  x: extractTwitterPost,
  instagram: (url) => extractViaYtDlp(url, "instagram"),
  facebook: (url) => extractViaYtDlp(url, "facebook"),
};

/**
 * Validates the URL, then dispatches to the right platform extractor.
 * Throws an ExtractionError (see errors.ts) on any failure - callers should
 * let it propagate to the HTTP layer, which maps it to a status + body.
 */
export async function extract(rawUrl: string): Promise<ExtractionSidecarResponse> {
  const { platform } = parsePostUrl(rawUrl);
  return EXTRACTORS[platform](rawUrl);
}
