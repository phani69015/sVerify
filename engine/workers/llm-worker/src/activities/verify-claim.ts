import { hfClientFromEnv } from "@sverify/clients";
import type { ClaimVerificationResult, EvidenceSource, Verdict } from "@sverify/schemas";
import { mockVerification } from "@sverify/mocks";

interface HfChatResponse {
  generated_text?: string;
  choices?: { message?: { content?: string } }[];
}

const VERDICT_PROMPT = `You are a fact-checking assistant. Given a CLAIM and a list of EVIDENCE snippets, determine whether the evidence SUPPORTS, CONTRADICTS, shows the claim to be MISLEADING (technically true but presented deceptively), or is UNVERIFIED (insufficient evidence either way).

Respond with ONLY a JSON object of this exact shape, no prose:
{"verdict": "SUPPORTED" | "CONTRADICTED" | "MISLEADING" | "UNVERIFIED", "confidence": 0.0-1.0, "explanation": "short reason"}

Do not use your own outside knowledge - base the verdict strictly on the evidence provided. If evidence is empty or irrelevant, respond UNVERIFIED.
`;

export async function verifyClaim(input: {
  claim: string;
  evidence: EvidenceSource[];
  mock: boolean;
}): Promise<ClaimVerificationResult> {
  if (input.mock) return mockVerification(input.claim, input.evidence);

  const client = hfClientFromEnv("HF_LLM_ENDPOINT_URL");
  const evidenceBlock = input.evidence.length
    ? input.evidence.map((e, i) => `Source ${i + 1} (${e.title}): ${e.snippet}`).join("\n")
    : "(no evidence found)";

  const response = await client.post<HfChatResponse>({
    inputs: `${VERDICT_PROMPT}\nCLAIM:\n${input.claim}\n\nEVIDENCE:\n${evidenceBlock}\n`,
    parameters: { max_new_tokens: 300, temperature: 0.0, return_full_text: false },
  });

  const raw = response.generated_text ?? response.choices?.[0]?.message?.content ?? "{}";
  const parsed = parseVerdict(raw);

  return {
    claim: input.claim,
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    explanation: parsed.explanation,
    sources: input.evidence,
  };
}

function parseVerdict(raw: string): { verdict: Verdict; confidence: number; explanation: string } {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    const verdict: Verdict = ["SUPPORTED", "CONTRADICTED", "MISLEADING", "UNVERIFIED"].includes(parsed.verdict)
      ? parsed.verdict
      : "UNVERIFIED";
    return {
      verdict,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "No explanation provided.",
    };
  } catch {
    return { verdict: "UNVERIFIED", confidence: 0, explanation: "Failed to parse model output." };
  }
}
