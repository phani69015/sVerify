import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtractionSidecarResponse, Platform } from "@sverify/schemas";
import { ExtractionError } from "../errors";

const execFileAsync = promisify(execFile);

interface YtDlpFormat {
  url?: string;
  ext?: string;
  vcodec?: string;
  height?: number;
  tbr?: number;
}

interface YtDlpThumbnail {
  url?: string;
}

interface YtDlpEntry {
  formats?: YtDlpFormat[];
  thumbnails?: YtDlpThumbnail[];
}

interface YtDlpInfo extends YtDlpEntry {
  description?: string;
  uploader?: string;
  entries?: YtDlpEntry[];
}

/**
 * Runs `yt-dlp -J` for a post and returns its parsed metadata JSON.
 *
 * `--ignore-no-formats-error` is the key flag here: without it, yt-dlp
 * hard-errors the *entire* command the moment any single carousel item has
 * no video (i.e. any image-only post, or any image inside a mixed
 * image/video carousel) instead of returning the JSON it already has. With
 * it, image-only items simply come back with `formats: []` and a
 * `thumbnails` array we can use instead.
 */
async function fetchYtDlpInfo(url: string, platform: Platform): Promise<YtDlpInfo> {
  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      "-J",
      "--no-warnings",
      "--ignore-no-formats-error",
      url,
    ]);
    return JSON.parse(stdout) as YtDlpInfo;
  } catch (err) {
    throw classifyYtDlpError(err, url, platform);
  }
}

/** All items in a post: the carousel entries if present, else the post itself. */
function ytDlpItems(info: YtDlpInfo): YtDlpEntry[] {
  return info.entries && info.entries.length > 0 ? info.entries : [info];
}

/** Best (highest resolution) real video format URL for a single item, or null. */
function bestVideoFormatUrl(entry: YtDlpEntry): string | null {
  const videoFormats = (entry.formats ?? []).filter((f) => f.url && f.vcodec && f.vcodec !== "none");
  if (videoFormats.length === 0) return null;

  return videoFormats.sort((a, b) => (b.height ?? b.tbr ?? 0) - (a.height ?? a.tbr ?? 0))[0].url ?? null;
}

/** Best (largest) thumbnail URL for a single item, or null - used as the image for photo items. */
function bestThumbnailUrl(entry: YtDlpEntry): string | null {
  const thumbs = entry.thumbnails ?? [];
  return thumbs.at(-1)?.url ?? null;
}

/**
 * Generic yt-dlp-backed extractor shared by every platform that doesn't
 * have a nicer public API (currently Instagram and Facebook - X/Twitter
 * uses the syndication API instead, see platforms/x.ts).
 *
 * Walks every item in the post (a single item, or every entry of a
 * carousel) and buckets each one into either the single "primary" video
 * (v1: one video per post, matching ExtractedPost.videoKey) or the image
 * list, based on whether yt-dlp found a real video format for it.
 */
export async function extractViaYtDlp(url: string, platform: Platform): Promise<ExtractionSidecarResponse> {
  const info = await fetchYtDlpInfo(url, platform);

  let video: string | null = null;
  const images: string[] = [];

  for (const item of ytDlpItems(info)) {
    const videoUrl = bestVideoFormatUrl(item);
    if (videoUrl) {
      video ??= videoUrl;
      continue;
    }

    const thumbnailUrl = bestThumbnailUrl(item);
    if (thumbnailUrl) images.push(thumbnailUrl);
  }

  return {
    platform,
    postUrl: url,
    author: info.uploader ?? null,
    text: info.description ?? "",
    images,
    video,
  };
}

function classifyYtDlpError(err: unknown, url: string, platform: Platform): ExtractionError {
  const message = err instanceof Error ? err.message : String(err);

  if (/private|empty media response|log ?in/i.test(message)) {
    return new ExtractionError("PRIVATE_OR_LOGIN_REQUIRED", `${platform} post requires login or is private: ${url}`);
  }
  if (/not available|404|does not exist|cannot parse data/i.test(message)) {
    return new ExtractionError("DELETED_OR_NOT_FOUND", `${platform} post not found or deleted: ${url}`);
  }
  if (/unsupported url/i.test(message)) {
    return new ExtractionError("INVALID_URL", `This URL isn't a supported ${platform} post link: ${url}`);
  }
  return new ExtractionError("EXTRACTION_FAILED", `Failed to extract ${platform} post ${url}: ${message}`);
}
