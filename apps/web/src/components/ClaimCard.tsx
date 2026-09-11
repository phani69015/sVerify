import type { ClaimVerificationResult, Verdict } from "@sverify/schemas";

const VERDICT_META: Record<Verdict, { emoji: string; label: string; classes: string }> = {
  SUPPORTED: { emoji: "✅", label: "SUPPORTED", classes: "text-emerald-400" },
  CONTRADICTED: { emoji: "❌", label: "CONTRADICTED", classes: "text-red-400" },
  MISLEADING: { emoji: "⚠️", label: "MISLEADING", classes: "text-amber-400" },
  UNVERIFIED: { emoji: "❔", label: "UNVERIFIED", classes: "text-neutral-400" },
};

export function ClaimCard({ result }: { result: ClaimVerificationResult }) {
  const meta = VERDICT_META[result.verdict];
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        Claim verification
      </h3>
      <div className={`text-lg font-semibold ${meta.classes}`}>
        {meta.emoji} {meta.label}
      </div>
      <blockquote className="mt-2 border-l-2 border-neutral-700 pl-3 text-sm italic text-neutral-300">
        &ldquo;{result.claim}&rdquo;
      </blockquote>
      <div className="mt-2 text-sm text-neutral-400">Confidence: {Math.round(result.confidence * 100)}%</div>

      <div className="mt-4">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">Why?</h4>
        <p className="text-sm text-neutral-300">{result.explanation}</p>
      </div>

      {result.sources.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Evidence
          </h4>
          <ul className="space-y-1.5">
            {result.sources.map((s, i) => (
              <li key={i} className="text-sm">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-400 hover:underline"
                >
                  {s.title}
                </a>
                <span className="text-neutral-500"> — {s.snippet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
