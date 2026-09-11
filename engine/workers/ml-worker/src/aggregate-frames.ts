import type { MediaClassification } from "@sverify/schemas";

export interface FrameClassification {
  classification: MediaClassification;
  confidence: number;
}

/**
 * Combines per-frame deepfake predictions into one video-level result.
 * We deliberately err towards flagging: if ANY sampled frame confidently
 * shows AI-generated or manipulated content, the whole video is flagged as
 * such, even if most frames look authentic (a manipulated clip is often
 * only altered in a subset of frames).
 */
export function aggregateFrameClassifications(frames: FrameClassification[]): FrameClassification {
  if (frames.length === 0) {
    return { classification: "UNABLE_TO_DETERMINE", confidence: 0 };
  }

  const mostConfidentOf = (classification: MediaClassification): FrameClassification | null => {
    const matches = frames.filter((f) => f.classification === classification);
    if (matches.length === 0) return null;
    return matches.reduce((best, f) => (f.confidence > best.confidence ? f : best));
  };

  // Priority order: most concerning classification wins if any frame is confident about it.
  const CONFIDENCE_THRESHOLD = 0.5;
  for (const classification of ["AI_GENERATED", "POTENTIALLY_MANIPULATED"] as const) {
    const best = mostConfidentOf(classification);
    if (best && best.confidence >= CONFIDENCE_THRESHOLD) return best;
  }

  const authentic = frames.filter((f) => f.classification === "AUTHENTIC");
  if (authentic.length > frames.length / 2) {
    const avgConfidence = authentic.reduce((sum, f) => sum + f.confidence, 0) / authentic.length;
    return { classification: "AUTHENTIC", confidence: avgConfidence };
  }

  return { classification: "UNABLE_TO_DETERMINE", confidence: 0 };
}
