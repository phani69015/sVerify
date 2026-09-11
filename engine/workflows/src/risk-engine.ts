import type {
  MediaAnalysisResult,
  ClaimVerificationResult,
  OverallRisk,
} from "@sverify/schemas";

/**
 * Deterministic risk engine. Pure function, no I/O, no LLM.
 * Safe to call directly inside workflow code (Temporal workflows must be
 * deterministic - this qualifies since it only depends on its inputs).
 */
export function computeOverallRisk(
  media: MediaAnalysisResult | null,
  claims: ClaimVerificationResult[]
): OverallRisk {
  const mediaUnknown = !media || media.classification === "UNABLE_TO_DETERMINE";
  const claimsUnknown = claims.length === 0 || claims.every((c) => c.verdict === "UNVERIFIED");

  if (mediaUnknown && claimsUnknown) {
    return "UNABLE_TO_DETERMINE";
  }

  const hasContradicted = claims.some((c) => c.verdict === "CONTRADICTED" && c.confidence >= 0.6);
  const hasMisleading = claims.some((c) => c.verdict === "MISLEADING" && c.confidence >= 0.6);
  const mediaFlagged =
    !!media &&
    (media.classification === "AI_GENERATED" || media.classification === "POTENTIALLY_MANIPULATED") &&
    media.confidence >= 0.6;

  if (mediaFlagged && (hasContradicted || hasMisleading)) {
    return "HIGH";
  }
  if (hasContradicted && media?.classification === "AI_GENERATED") {
    return "HIGH";
  }
  if (hasContradicted || mediaFlagged) {
    return "MEDIUM";
  }
  if (hasMisleading) {
    return "MEDIUM";
  }

  const allSupported = claims.length > 0 && claims.every((c) => c.verdict === "SUPPORTED");
  if (allSupported && !mediaFlagged) {
    return "LOW";
  }

  return claimsUnknown && mediaUnknown ? "UNABLE_TO_DETERMINE" : "LOW";
}
