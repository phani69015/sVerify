import type { ExtractionSidecarResponse } from "@sverify/schemas";

export class ExtractionSidecarError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ExtractionSidecarError";
  }
}

/**
 * Thin HTTP client for the extraction-sidecar service (apps/extraction-sidecar).
 * The sidecar owns all platform scraping (yt-dlp, syndication APIs, ...) and
 * returns only metadata + directly-fetchable media URLs - callers are
 * responsible for downloading/storing that media themselves.
 */
export function extractionSidecarUrlFromEnv(): string {
  return process.env.EXTRACTION_SIDECAR_URL ?? "http://localhost:4200";
}

export async function extractPostViaSidecar(
  postUrl: string,
  baseUrl: string = extractionSidecarUrlFromEnv()
): Promise<ExtractionSidecarResponse> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: postUrl }),
    });
  } catch (err) {
    throw new ExtractionSidecarError(
      "EXTRACTION_FAILED",
      `Could not reach extraction-sidecar at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const rawBody: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const body = rawBody as { code?: string; message?: string };
    throw new ExtractionSidecarError(
      body.code ?? "EXTRACTION_FAILED",
      body.message ?? `Request failed (${res.status})`
    );
  }

  return rawBody as ExtractionSidecarResponse;
}
