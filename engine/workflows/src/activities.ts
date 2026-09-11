import type {
  ExtractedPost,
  MediaAnalysisResult,
  TranscriptResult,
  Claim,
  ClaimVerificationResult,
  EvidenceSource,
} from "@sverify/schemas";

// ---------------------------------------------------------------------------
// Activity contracts
// ---------------------------------------------------------------------------
// Every activity below is implemented by exactly ONE worker process (noted in
// the comment) and runs on exactly ONE Temporal task queue (see TASK_QUEUES).
// The Workflow only imports these as *types* (`import type`), so none of this
// file's runtime code ends up bundled into the deterministic workflow sandbox.
//
// Convention: every activity takes a single input object that always
// includes `mock: boolean`. When `mock` is true, the activity implementation
// must skip all real I/O (no network calls, no shelling out to yt-dlp/ffmpeg,
// no Hugging Face requests) and return a canned response instead. This is
// what powers the `x-mock: true` request header end to end - the flag is set
// once in the API and threaded through the workflow to every activity call.
// ---------------------------------------------------------------------------

/** apps/workers/extraction-worker - task queue: "extraction-tq" */
export interface ExtractionActivities {
  /** Scrapes a public post (caption + video) and uploads media to S3/MinIO. */
  extractPost(input: { url: string; mock: boolean }): Promise<ExtractedPost>;
}

/** apps/workers/ml-worker - task queue: "ml-tq" */
export interface MlActivities {
  /**
   * Classifies media as real/manipulated/AI-generated via a Hugging Face
   * endpoint. Pass exactly one of `videoKey` (samples frames from the
   * video) or `imageKeys` (classifies each image directly) - whichever the
   * post actually has. Passing neither returns UNABLE_TO_DETERMINE.
   */
  detectDeepfake(input: {
    videoKey: string | null;
    imageKeys: string[];
    mock: boolean;
  }): Promise<MediaAnalysisResult>;
  /** Extracts audio (ffmpeg) and transcribes it via a Hugging Face Whisper endpoint. Video posts only. */
  transcribeAudio(input: { videoKey: string; mock: boolean }): Promise<TranscriptResult>;
}

/** apps/workers/llm-worker - task queue: "llm-tq" */
export interface LlmActivities {
  /** Extracts atomic factual claims from the post caption + video transcript. */
  extractClaims(input: { text: string; transcript: string; mock: boolean }): Promise<Claim[]>;
  /** Web search + BGE-M3 embedding + Qdrant retrieval of evidence for one claim. */
  searchEvidence(input: { claim: string; mock: boolean }): Promise<EvidenceSource[]>;
  /** Judges a claim against its evidence, returns verdict + confidence + explanation. */
  verifyClaim(input: {
    claim: string;
    evidence: EvidenceSource[];
    mock: boolean;
  }): Promise<ClaimVerificationResult>;
}

/** apps/workers/io-worker - task queue: "io-tq" */
export interface IoActivities {
  /**
   * Writes the final (or failed) result to Postgres. Always real - never
   * mocked. Also write-through caches COMPLETE results in Redis, keyed by
   * `url`, so a re-submission of the same post URL can skip the pipeline
   * entirely - see apps/api/src/routes/verify.ts.
   */
  persistResult(input: { analysisId: string; url: string; resultJson: string }): Promise<void>;
}

export type AllActivities = ExtractionActivities & MlActivities & LlmActivities & IoActivities;

export const TASK_QUEUES = {
  ORCHESTRATION: "orchestration-tq",
  EXTRACTION: "extraction-tq",
  ML: "ml-tq",
  LLM: "llm-tq",
  IO: "io-tq",
} as const;
