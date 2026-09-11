import { randomUUID } from "node:crypto";
import { hfClientFromEnv, qdrantClientFromEnv, EVIDENCE_COLLECTION } from "@sverify/clients";
import type { EvidenceSource } from "@sverify/schemas";
import { mockEvidence } from "@sverify/mocks";

interface BingSearchResponse {
  webPages?: { value?: { name: string; url: string; snippet: string }[] };
}

const qdrant = qdrantClientFromEnv();
let collectionEnsured = false;

/**
 * Retrieves evidence for a claim:
 *  1. Web search for candidate documents.
 *  2. Embed claim + candidate snippets with BGE-M3 (via HF endpoint).
 *  3. Upsert into Qdrant, then query top-k most relevant passages.
 */
export async function searchEvidence(input: { claim: string; mock: boolean }): Promise<EvidenceSource[]> {
  if (input.mock) return mockEvidence();

  const docs = await webSearch(input.claim);
  if (docs.length === 0) return [];

  const [claimVector, ...docVectors] = await embed([input.claim, ...docs.map((d) => d.snippet)]);
  await ensureCollection(claimVector.length);

  await qdrant.upsert(EVIDENCE_COLLECTION, {
    points: docs.map((doc, i) => ({
      id: randomUUID(),
      vector: docVectors[i],
      payload: { title: doc.title, url: doc.url, snippet: doc.snippet, claim: input.claim },
    })),
  });

  const topK = await qdrant.query(EVIDENCE_COLLECTION, {
    query: claimVector,
    limit: 5,
    with_payload: true,
    filter: { must: [{ key: "claim", match: { value: input.claim } }] },
  });

  return topK.points.map((p) => p.payload as unknown as EvidenceSource);
}

async function ensureCollection(vectorSize: number) {
  if (collectionEnsured) return;
  const exists = await qdrant.collectionExists(EVIDENCE_COLLECTION);
  if (!exists.exists) {
    await qdrant.createCollection(EVIDENCE_COLLECTION, { vectors: { size: vectorSize, distance: "Cosine" } });
  }
  collectionEnsured = true;
}

async function embed(texts: string[]): Promise<number[][]> {
  const client = hfClientFromEnv("HF_EMBEDDING_ENDPOINT_URL");
  const response = await client.post<number[][] | { embeddings: number[][] }>({ inputs: texts });
  return Array.isArray(response) ? response : response.embeddings;
}

async function webSearch(query: string): Promise<EvidenceSource[]> {
  // Toggle: SEARCH_ENABLED=false (or missing SEARCH_API_URL/KEY) skips web
  // search entirely instead of failing the activity - claims just end up
  // with no evidence (UNVERIFIED verdict) rather than blocking the whole
  // pipeline on a paid search API key nobody has configured locally.
  const searchEnabled = (process.env.SEARCH_ENABLED ?? "true").toLowerCase() !== "false";
  const apiUrl = process.env.SEARCH_API_URL;
  const apiKey = process.env.SEARCH_API_KEY;

  if (!searchEnabled || !apiUrl || !apiKey) {
    return [];
  }

  const res = await fetch(`${apiUrl}?q=${encodeURIComponent(query)}`, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
  });
  if (!res.ok) throw new Error(`Search API failed: ${res.status}`);

  const data = (await res.json()) as BingSearchResponse;
  return (data.webPages?.value ?? []).map((r) => ({ title: r.name, url: r.url, snippet: r.snippet }));
}
