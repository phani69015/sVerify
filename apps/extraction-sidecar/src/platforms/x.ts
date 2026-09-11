import type { ExtractionSidecarResponse } from "@sverify/schemas";
import { ExtractionError } from "../errors";

interface SyndicationPhoto {
  url: string;
}

interface SyndicationVideoVariant {
  type: string;
  src: string;
  bitrate?: number;
}

interface SyndicationTweet {
  __typename?: string;
  text?: string;
  user?: { name?: string; screen_name?: string };
  photos?: SyndicationPhoto[];
  video?: { variants?: SyndicationVideoVariant[] };
  mediaDetails?: Array<{ type?: string }>;
  tombstone?: { text?: { text?: string } };
}

function extractTweetId(url: string): string {
  const match = url.match(/\/status\/(\d+)/i);
  if (!match) {
    throw new ExtractionError("INVALID_URL", `Not a tweet URL: ${url}`);
  }
  return match[1];
}

/** Same token derivation embed widgets use to call the public syndication API. */
function syndicationToken(tweetId: string): string {
  return ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

/**
 * Reads a tweet via Twitter/X's public syndication endpoint (the one embed
 * widgets use) - no auth needed, and unlike yt-dlp's twitter extractor it
 * works for text-only and image-only tweets, not just video ones.
 */
async function fetchTweet(tweetId: string, url: string): Promise<SyndicationTweet> {
  const endpoint = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${syndicationToken(
    tweetId
  )}`;

  let res: Response;
  try {
    res = await fetch(endpoint, { headers: { accept: "application/json" } });
  } catch (err) {
    throw new ExtractionError(
      "EXTRACTION_FAILED",
      `Failed to reach Twitter/X for ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (res.status === 404) {
    throw new ExtractionError("DELETED_OR_NOT_FOUND", `Tweet not found: ${url}`);
  }
  if (!res.ok) {
    throw new ExtractionError(
      "EXTRACTION_FAILED",
      `Twitter/X syndication API returned ${res.status} for ${url}`
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    // The endpoint serves an HTML error page (not JSON) for bad ids/tokens.
    throw new ExtractionError("DELETED_OR_NOT_FOUND", `Tweet not found or unavailable: ${url}`);
  }

  const data = (await res.json()) as SyndicationTweet;

  if (data.__typename === "TweetTombstone") {
    const tombstoneText = data.tombstone?.text?.text ?? "";
    if (/login|log in|sign in/i.test(tombstoneText)) {
      throw new ExtractionError("PRIVATE_OR_LOGIN_REQUIRED", `Tweet requires login or is private: ${url}`);
    }
    throw new ExtractionError("DELETED_OR_NOT_FOUND", `Tweet unavailable or deleted: ${url}`);
  }

  return data;
}

function bestVideoUrl(tweet: SyndicationTweet): string | null {
  const variants = tweet.video?.variants ?? [];
  const mp4Variants = variants.filter((v) => v.type === "video/mp4");
  if (mp4Variants.length === 0) return null;

  // Pick the highest-bitrate mp4 variant available.
  return mp4Variants.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0].src;
}

export async function extractTwitterPost(url: string): Promise<ExtractionSidecarResponse> {
  const tweetId = extractTweetId(url);
  const tweet = await fetchTweet(tweetId, url);

  return {
    platform: "x",
    postUrl: url,
    author: tweet.user?.name ?? tweet.user?.screen_name ?? null,
    text: tweet.text ?? "",
    images: (tweet.photos ?? []).map((p) => p.url),
    video: bestVideoUrl(tweet),
  };
}
