const PLATFORM_HOSTS: Record<string, "facebook" | "instagram" | "x"> = {
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

export type Platform = "facebook" | "instagram" | "x";

/**
 * Parses a post URL and returns which supported platform it belongs to,
 * or null if the URL is empty, malformed, or from an unsupported host.
 */
export function detectPlatform(rawUrl: string): Platform | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase();
  return PLATFORM_HOSTS[host] ?? null;
}

// Mirrors the extraction worker's per-platform path check, so the UI
// rejects non-post links (profile, home, trending, etc.) before ever
// starting a verification job.
const POST_PATH_PATTERNS: Record<Platform, RegExp> = {
  x: /\/status\/\d+/i,
  instagram: /\/(p|reel|tv)\/[^/]+/i,
  facebook: /\/(posts|videos|photos|watch|reel)\b|photo\.php|story\.php/i,
};

/**
 * True only if the URL is from a supported platform AND looks like a link
 * to a specific post (not a profile, home feed, trending topic, etc.).
 */
export function isSupportedPostUrl(rawUrl: string): boolean {
  const platform = detectPlatform(rawUrl);
  if (!platform) return false;
  return POST_PATH_PATTERNS[platform].test(rawUrl.trim());
}
