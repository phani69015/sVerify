import "dotenv/config";
import { NativeConnection, Worker } from "@temporalio/worker";
import { TASK_QUEUES } from "@sverify/temporal-workflows";
import { buildIdentity } from "@sverify/clients";
import { extractClaims } from "./activities/extract-claims";
import { searchEvidence } from "./activities/search-evidence";
import { verifyClaim } from "./activities/verify-claim";

async function main() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    identity: buildIdentity("sverify-llm-worker"),
    taskQueue: TASK_QUEUES.LLM,
    activities: { extractClaims, searchEvidence, verifyClaim },
  });

  console.log(`llm-worker listening on task queue "${TASK_QUEUES.LLM}"`);
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
