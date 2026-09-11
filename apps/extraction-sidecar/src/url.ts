import type { Platform } from "@sverify/schemas";
import { ExtractionError } from "./errors";

const PLATFORM_HOSTS: Record<string, Platform> = {
  "facebook.com": "facebook",
  "www.facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "web.facebook.com": "facebook",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "x.com": "x",
  "www.x.com": "x",
  "mobile.x.com": "x",
  "twitter.com": "x",
  "www.twitter.com": "x",
  "mobile.twitter.com": "x",
};

// A post permalink, not a profile/home/trending/search link.
const POST_PATH_PATTERNS: Record<Platform, RegExp> = {
  x: /\/status\/\d+/i,
  instagram: /\/(p|reel|tv)\/[^/]+/i,
  facebook: /\/(posts|videos|photos|watch|reel)\b|photo\.php|story\.php/i,
};

/** Parses + validates a post URL, throwing a classified ExtractionError on any problem. */
export function parsePostUrl(rawUrl: string): { platform: Platform; url: URL } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ExtractionError("INVALID_URL", `Not a valid URL: ${rawUrl}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ExtractionError("INVALID_URL", `Not a valid URL: ${rawUrl}`);
  }

  const platform = PLATFORM_HOSTS[url.hostname.toLowerCase()];
  if (!platform) {
    throw new ExtractionError(
      "UNSUPPORTED_PLATFORM",
      `URL is not a recognized Facebook, Instagram, or X post: ${rawUrl}`
    );
  }

  if (!POST_PATH_PATTERNS[platform].test(rawUrl)) {
    throw new ExtractionError(
      "INVALID_URL",
      `This looks like a ${platform} link, but not a link to a specific post: ${rawUrl}`
    );
  }

  return { platform, url };
}
