import { Pool } from "pg";

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://sverify:sverify@localhost:5432/sverify",
});

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analyses (
      analysis_id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function insertPendingAnalysis(analysisId: string, url: string, workflowId: string) {
  await pool.query(
    `INSERT INTO analyses (analysis_id, url, workflow_id, status) VALUES ($1, $2, $3, 'PENDING')`,
    [analysisId, url, workflowId]
  );
}

/**
 * Inserts an analysis that's already COMPLETE from the moment it's created -
 * used for cache hits (see routes/verify.ts), where we already have the full
 * result from a previous identical URL submission and never start a workflow
 * at all. `workflow_id` has no real Temporal workflow behind it in this case,
 * hence the `cache:` sentinel prefix (never dereferenced - GET short-circuits
 * on `status` before it would ever look up the workflow).
 */
export async function insertCompletedAnalysis(analysisId: string, url: string, resultJson: string) {
  await pool.query(
    `INSERT INTO analyses (analysis_id, url, workflow_id, status, result)
     VALUES ($1, $2, $3, 'COMPLETE', $4::jsonb)`,
    [analysisId, url, `cache:${analysisId}`, resultJson]
  );
}

export async function getAnalysis(analysisId: string) {
  const { rows } = await pool.query(`SELECT * FROM analyses WHERE analysis_id = $1`, [analysisId]);
  return rows[0] ?? null;
}
