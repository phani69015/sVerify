import { createHash } from "node:crypto";
import Redis from "ioredis";

let client: Redis | null = null;

/**
 * Lazily-created, module-level singleton Redis client (mirrors the
 * s3ClientFromEnv/qdrant client pattern elsewhere in this package). ioredis
 * queues commands until the connection is up, so this is safe to call
 * synchronously at import time.
 */
export function redisClientFromEnv(): Redis {
  if (client) return client;

  client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 2,
  });

  client.on("error", (err) => {
    // Never let a cache outage take down the process - callers already
    // treat cache misses/errors as "just go compute it for real".
    console.error("[redis] connection error:", err.message);
  });

  return client;
}

/** Stable cache key for a post URL - the same URL always maps to the same key. */
export function verificationCacheKey(url: string): string {
  const normalized = url.trim();
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `sverify:verify-result:${hash}`;
}

/** Reads and JSON-parses a cache entry. Returns null on a miss OR any error (corrupt entry, Redis down, ...). */
export async function getCachedJSON<T>(redis: Redis, key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Writes a JSON-serializable value with a TTL. Swallows errors - caching is a best-effort optimization. */
export async function setCachedJSON(redis: Redis, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // best-effort - a failed cache write should never fail the request that produced the result
  }
}
