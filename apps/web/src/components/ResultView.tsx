import type { VerificationResult, OverallRisk } from "@sverify/schemas";
import { RiskBanner } from "./RiskBanner";
import { MediaCard } from "./MediaCard";
import { ClaimCard } from "./ClaimCard";

const RECOMMENDATION: Record<OverallRisk, string> = {
  LOW: "No strong signs of manipulation or false claims were found. Still, always cross-check important claims yourself.",
  MEDIUM:
    "Some signals suggest this content may be misleading or the media may be altered. Verify with additional sources before sharing.",
  HIGH: "Treat this content as potentially misleading. Multiple strong signals indicate manipulated media and/or contradicted claims.",
  UNABLE_TO_DETERMINE:
    "We could not gather enough evidence or media signal to make a confident assessment. Treat with caution.",
};

export function ResultView({ result }: { result: VerificationResult }) {
  return (
    <div className="w-full max-w-2xl space-y-4">
      {result.overallRisk && <RiskBanner risk={result.overallRisk} />}

      <MediaCard media={result.media} />

      {result.claims.length === 0 && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 text-sm text-neutral-400">
          No checkable factual claims were found in this post.
        </section>
      )}

      {result.claims.map((c, i) => (
        <ClaimCard key={i} result={c} />
      ))}

      {result.explanation && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Summary
          </h3>
          <p className="text-sm text-neutral-300">{result.explanation}</p>
        </section>
      )}

      {result.overallRisk && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Recommendation
          </h3>
          <p className="text-sm text-neutral-300">{RECOMMENDATION[result.overallRisk]}</p>
        </section>
      )}
    </div>
  );
}
