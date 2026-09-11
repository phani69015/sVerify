import type {
  ExtractedPost,
  Platform,
  MediaAnalysisResult,
  TranscriptResult,
  Claim,
  ClaimVerificationResult,
  EvidenceSource,
} from "@sverify/schemas";

// ---------------------------------------------------------------------------
// Single source of truth for every canned response used in mock mode
// (`x-mock: true` on POST /api/v1/verify).
//
// Every worker activity imports its mock from here instead of defining its
// own - this is the ONE place to look to see exactly what a mock run
// produces at each stage of the pipeline, and the only place to edit if you
// want to change the demo scenario.
//
// The scenario is deliberately themed around the "NASA confirmed aliens
// landed in New York" example from the original project spec, so a full
// mock run always produces one coherent, demo-able result:
//
//   extractPost      -> caption + a video is "found"
//   detectDeepfake   -> media flagged as POTENTIALLY_MANIPULATED
//   transcribeAudio  -> transcript repeats the same claim
//   extractClaims    -> the one claim below
//   searchEvidence   -> two sources that contradict it
//   verifyClaim      -> CONTRADICTED, high confidence
//   => risk engine computes HIGH (see packages/temporal-workflows/src/risk-engine.ts)
// ---------------------------------------------------------------------------

export const MOCK_CLAIM_TEXT = "NASA confirmed aliens landed in New York.";

// --- extraction-worker: extractPost -----------------------------------------

export function mockExtractedPost(platform: Platform, url: string): ExtractedPost {
  return {
    platform,
    postUrl: url,
    author: "mock_user",
    text: "BREAKING: NASA confirmed aliens landed in New York. Video evidence inside.",
    imageKeys: [],
    videoKey: "mock/videos/sample.mp4",
  };
}

// --- ml-worker: detectDeepfake, transcribeAudio -----------------------------

export function mockDeepfakeResult(): MediaAnalysisResult {
  return { classification: "POTENTIALLY_MANIPULATED", confidence: 0.94 };
}

export function mockTranscript(): TranscriptResult {
  return {
    text: "Scientists have confirmed that NASA detected alien spacecraft landing in New York City.",
    language: "en",
  };
}

// --- llm-worker: extractClaims, searchEvidence, verifyClaim ----------------

export function mockClaims(): Claim[] {
  return [{ id: "mock-claim-1", text: MOCK_CLAIM_TEXT }];
}

export function mockEvidence(): EvidenceSource[] {
  return [
    {
      title: "NASA Newsroom",
      url: "https://www.nasa.gov/news",
      snippet: "NASA has made no such announcement regarding extraterrestrial landings.",
    },
    {
      title: "Reuters Fact Check",
      url: "https://www.reuters.com/fact-check",
      snippet: "No credible reports confirm any alien landing event in New York.",
    },
  ];
}

export function mockVerification(claim: string, evidence: EvidenceSource[]): ClaimVerificationResult {
  return {
    claim,
    verdict: "CONTRADICTED",
    confidence: 0.91,
    explanation:
      "No credible evidence supports the claim, while available authoritative sources contradict it.",
    sources: evidence,
  };
}
