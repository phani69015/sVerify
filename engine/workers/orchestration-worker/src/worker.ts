import "dotenv/config";
import { NativeConnection, Worker } from "@temporalio/worker";
import { TASK_QUEUES } from "@sverify/temporal-workflows";
import { buildIdentity } from "@sverify/clients";

/**
 * This worker executes ONLY the workflow orchestration logic
 * (verificationWorkflow). It has no activity implementations registered -
 * every step it calls (extraction, ml, llm, io) is dispatched to the
 * respective worker via its own task queue.
 */
async function main() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    identity: buildIdentity("sverify-orchestration-worker"),
    taskQueue: TASK_QUEUES.ORCHESTRATION,
    workflowsPath: require.resolve("@sverify/temporal-workflows/src/workflows"),
  });

  console.log(`orchestration-worker listening on task queue "${TASK_QUEUES.ORCHESTRATION}"`);
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
