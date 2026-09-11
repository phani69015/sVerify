import type { VerificationResult } from "@sverify/schemas";

export interface ProcessingResponse {
  analysisId: string;
  status: "PROCESSING";
}

export interface FailedResponse {
  analysisId: string;
  status: "FAILED";
  errorCode?: string | null;
  errorMessage?: string | null;
}

export type PollResponse = ProcessingResponse | FailedResponse | VerificationResult;

export function isComplete(r: PollResponse): r is VerificationResult {
  return r.status === "COMPLETE";
}

export function isFailed(r: PollResponse): r is FailedResponse {
  return r.status === "FAILED";
}
