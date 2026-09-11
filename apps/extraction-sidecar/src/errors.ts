import type { ExtractionErrorCode } from "@sverify/schemas";

/**
 * A classified extraction failure. `code` maps 1:1 onto
 * `ExtractionErrorCode` from @sverify/schemas so the extraction-worker can
 * translate it directly into a Temporal `ApplicationFailure` (and decide
 * whether it's worth retrying).
 */
export class ExtractionError extends Error {
  constructor(public readonly code: ExtractionErrorCode, message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** HTTP status used for each error code in the sidecar's HTTP responses. */
export const ERROR_HTTP_STATUS: Record<ExtractionErrorCode, number> = {
  INVALID_URL: 400,
  UNSUPPORTED_PLATFORM: 400,
  PRIVATE_OR_LOGIN_REQUIRED: 403,
  DELETED_OR_NOT_FOUND: 404,
  EXTRACTION_FAILED: 502,
};
