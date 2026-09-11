import type { OverallRisk } from "@sverify/schemas";

const RISK_STYLES: Record<OverallRisk, { emoji: string; label: string; classes: string }> = {
  LOW: { emoji: "🟢", label: "LOW", classes: "border-emerald-700 bg-emerald-950 text-emerald-300" },
  MEDIUM: { emoji: "🟡", label: "MEDIUM", classes: "border-amber-700 bg-amber-950 text-amber-300" },
  HIGH: { emoji: "🔴", label: "HIGH", classes: "border-red-700 bg-red-950 text-red-300" },
  UNABLE_TO_DETERMINE: {
    emoji: "⚪",
    label: "UNABLE TO DETERMINE",
    classes: "border-neutral-700 bg-neutral-900 text-neutral-300",
  },
};

export function RiskBanner({ risk }: { risk: OverallRisk }) {
  const style = RISK_STYLES[risk];
  return (
    <div className={`rounded-xl border px-6 py-5 text-center ${style.classes}`}>
      <div className="text-xs font-semibold uppercase tracking-widest opacity-70">Overall risk</div>
      <div className="mt-1 text-3xl font-bold tracking-wide">
        {style.emoji} {style.label}
      </div>
    </div>
  );
}
