import { QdrantClient } from "@qdrant/js-client-rest";

export function qdrantClientFromEnv(): QdrantClient {
  return new QdrantClient({
    url: process.env.QDRANT_URL ?? "http://localhost:6333",
  });
}

export const EVIDENCE_COLLECTION = process.env.QDRANT_EVIDENCE_COLLECTION ?? "evidence";
