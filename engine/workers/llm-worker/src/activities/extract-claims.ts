import { randomUUID } from "node:crypto";
import { hfClientFromEnv } from "@sverify/clients";
import type { Claim } from "@sverify/schemas";
import { mockClaims } from "@sverify/mocks";

interface HfChatResponse {
  generated_text?: string;
  choices?: { message?: { content?: string } }[];
}

const CLAIM_EXTRACTION_PROMPT = `You are a fact-checking assistant. Extract distinct, atomic, checkable factual claims from the text below. Ignore opinions, jokes, and rhetorical statements. Return ONLY a JSON array of strings, no prose, e.g. ["claim one", "claim two"]. If there are no checkable factual claims, return [].

TEXT:
`;

/**
 * Calls the LLM hosted on a Hugging Face Inference Endpoint (e.g. TGI-backed)
 * to extract atomic factual claims from the post caption + video transcript.
 */
export async function extractClaims(input: {
  text: string;
  transcript: string;
  mock: boolean;
}): Promise<Claim[]> {
  if (input.mock) return mockClaims();

  const combined = [input.text, input.transcript].filter(Boolean).join("\n\n");
  if (!combined.trim()) return [];

  const client = hfClientFromEnv("HF_LLM_ENDPOINT_URL");
  const response = await client.post<HfChatResponse>({
    inputs: `${CLAIM_EXTRACTION_PROMPT}${combined}`,
    parameters: { max_new_tokens: 512, temperature: 0.0, return_full_text: false },
  });

  const raw = response.generated_text ?? response.choices?.[0]?.message?.content ?? "[]";
  return parseClaims(raw);
}

function parseClaims(raw: string): Claim[] {
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").map((text) => ({ id: randomUUID(), text }));
  } catch {
    return [];
  }
}
