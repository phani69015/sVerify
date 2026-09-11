import { Pool } from "pg";
import { redisClientFromEnv, verificationCacheKey, setCachedJSON } from "@sverify/clients";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://sverify:sverify@localhost:5432/sverify",
});

const redis = redisClientFromEnv();
const CACHE_TTL_SECONDS = Number(process.env.VERIFY_CACHE_TTL_SECONDS ?? 60 * 60); // 1 hour

/**
 * Writes the final (or failed) verification result to the app database.
 * This is the only activity allowed to touch Postgres for analysis records -
 * keeps a single write path regardless of which worker produced the result.
 *
 * Also write-through caches the result in Redis keyed by the post URL, but
 * only when it's a genuine COMPLETE success - a FAILED result is often due
 * to a transient issue (rate limiting, a flaky scrape) that's worth retrying
 * on the next submission of the same URL rather than caching forever.
 */
export async function persistResult(input: { analysisId: string; url: string; resultJson: string }): Promise<void> {
  const parsed = JSON.parse(input.resultJson) as { status: string };

  await pool.query(
    `UPDATE analyses SET status = $2, result = $3::jsonb, updated_at = now() WHERE analysis_id = $1`,
    [input.analysisId, parsed.status, input.resultJson]
  );

  if (parsed.status === "COMPLETE") {
    await setCachedJSON(redis, verificationCacheKey(input.url), JSON.parse(input.resultJson), CACHE_TTL_SECONDS);
  }
}
