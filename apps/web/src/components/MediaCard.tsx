import type { MediaAnalysisResult } from "@sverify/schemas";

const CLASSIFICATION_META: Record<
  MediaAnalysisResult["classification"],
  { emoji: string; label: string; classes: string }
> = {
  AUTHENTIC: { emoji: "✅", label: "AUTHENTIC", classes: "text-emerald-400" },
  POTENTIALLY_MANIPULATED: {
    emoji: "⚠️",
    label: "POTENTIALLY MANIPULATED",
    classes: "text-amber-400",
  },
  AI_GENERATED: { emoji: "🤖", label: "AI GENERATED", classes: "text-red-400" },
  UNABLE_TO_DETERMINE: { emoji: "❔", label: "UNABLE TO DETERMINE", classes: "text-neutral-400" },
};

export function MediaCard({ media }: { media: MediaAnalysisResult | null }) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        Media authenticity
      </h3>
      {media ? (
        <>
          <div className={`text-lg font-semibold ${CLASSIFICATION_META[media.classification].classes}`}>
            {CLASSIFICATION_META[media.classification].emoji}{" "}
            {CLASSIFICATION_META[media.classification].label}
          </div>
          <div className="mt-1 text-sm text-neutral-400">
            Confidence: {Math.round(media.confidence * 100)}%
          </div>
        </>
      ) : (
        <div className="text-sm text-neutral-500">No video/image media detected in this post.</div>
      )}
    </section>
  );
}
