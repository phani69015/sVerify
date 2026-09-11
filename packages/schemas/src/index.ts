import { z } from "zod";

// ---------------------------------------------------------------------------
// Platform / URL
// ---------------------------------------------------------------------------
export const PlatformSchema = z.enum(["facebook", "instagram", "x"]);
export type Platform = z.infer<typeof PlatformSchema>;

// ---------------------------------------------------------------------------
// Extraction (extraction-worker output)
// ---------------------------------------------------------------------------
export const ExtractedPostSchema = z.object({
  platform: PlatformSchema,
  postUrl: z.string().url(),
  author: z.string().nullable(),
  text: z.string().default(""),
  imageKeys: z.array(z.string()).default([]), // S3 object keys
  videoKey: z.string().nullable(), // S3 object key, single primary video for v1
});
export type ExtractedPost = z.infer<typeof ExtractedPostSchema>;

export const ExtractionErrorCode = z.enum([
  "INVALID_URL",
  "UNSUPPORTED_PLATFORM",
  "PRIVATE_OR_LOGIN_REQUIRED",
  "DELETED_OR_NOT_FOUND",
  "EXTRACTION_FAILED",
]);
export type ExtractionErrorCode = z.infer<typeof ExtractionErrorCode>;

// ---------------------------------------------------------------------------
// Extraction sidecar contract - the extraction-worker's HTTP client for the
// standalone extraction-sidecar service (apps/extraction-sidecar). The
// sidecar owns all platform scraping (yt-dlp, syndication APIs, ...) and
// only ever returns metadata + directly-fetchable media URLs; it never
// touches S3 - that stays the worker's job.
// ---------------------------------------------------------------------------
export const ExtractionSidecarRequestSchema = z.object({
  url: z.string().url(),
});
export type ExtractionSidecarRequest = z.infer<typeof ExtractionSidecarRequestSchema>;

export const ExtractionSidecarResponseSchema = z.object({
  platform: PlatformSchema,
  postUrl: z.string().url(),
  author: z.string().nullable(),
  text: z.string().default(""),
  images: z.array(z.string().url()).default([]), // directly downloadable image URLs
  video: z.string().url().nullable(), // directly downloadable video URL, if any
});
export type ExtractionSidecarResponse = z.infer<typeof ExtractionSidecarResponseSchema>;

export const ExtractionSidecarErrorSchema = z.object({
  code: ExtractionErrorCode,
  message: z.string(),
});
export type ExtractionSidecarError = z.infer<typeof ExtractionSidecarErrorSchema>;

// ---------------------------------------------------------------------------
// Media analysis (ml-worker output)
// ---------------------------------------------------------------------------
export const MediaClassificationSchema = z.enum([
  "AUTHENTIC",
  "POTENTIALLY_MANIPULATED",
  "AI_GENERATED",
  "UNABLE_TO_DETERMINE",
]);
export type MediaClassification = z.infer<typeof MediaClassificationSchema>;

export const MediaAnalysisResultSchema = z.object({
  classification: MediaClassificationSchema,
  confidence: z.number().min(0).max(1),
});
export type MediaAnalysisResult = z.infer<typeof MediaAnalysisResultSchema>;

export const TranscriptResultSchema = z.object({
  text: z.string(),
  language: z.string().nullable(),
});
export type TranscriptResult = z.infer<typeof TranscriptResultSchema>;

// ---------------------------------------------------------------------------
// Claims (llm-worker)
// ---------------------------------------------------------------------------
export const ClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const EvidenceSourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const VerdictSchema = z.enum([
  "SUPPORTED",
  "CONTRADICTED",
  "MISLEADING",
  "UNVERIFIED",
]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const ClaimVerificationResultSchema = z.object({
  claim: z.string(),
  verdict: VerdictSchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  sources: z.array(EvidenceSourceSchema),
});
export type ClaimVerificationResult = z.infer<typeof ClaimVerificationResultSchema>;

// ---------------------------------------------------------------------------
// Risk (computed inline in the workflow, deterministic)
// ---------------------------------------------------------------------------
export const OverallRiskSchema = z.enum(["LOW", "MEDIUM", "HIGH", "UNABLE_TO_DETERMINE"]);
export type OverallRisk = z.infer<typeof OverallRiskSchema>;

// ---------------------------------------------------------------------------
// Final result (API response for GET /verify/:id)
// ---------------------------------------------------------------------------
export const VerificationResultSchema = z.object({
  analysisId: z.string(),
  platform: PlatformSchema,
  status: z.enum(["PENDING", "PROCESSING", "COMPLETE", "FAILED"]),
  media: MediaAnalysisResultSchema.nullable(),
  claims: z.array(ClaimVerificationResultSchema),
  overallRisk: OverallRiskSchema.nullable(),
  explanation: z.string().nullable(),
  errorCode: ExtractionErrorCode.nullable(),
  errorMessage: z.string().nullable(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

// ---------------------------------------------------------------------------
// API request bodies
// ---------------------------------------------------------------------------
export const VerifyRequestSchema = z.object({
  url: z.string().url(),
});
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;
