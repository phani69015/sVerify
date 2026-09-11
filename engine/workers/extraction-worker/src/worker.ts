import "dotenv/config";
import { NativeConnection, Worker } from "@temporalio/worker";
import { TASK_QUEUES } from "@sverify/temporal-workflows";
import { buildIdentity } from "@sverify/clients";
import { extractPost } from "./activities/extract-post";

async function main() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    identity: buildIdentity("sverify-extraction-worker"),
    // This worker only executes activities (extraction), no workflow code needed.
    activities: { extractPost },
    taskQueue: TASK_QUEUES.EXTRACTION,
  });

  console.log(`extraction-worker listening on task queue "${TASK_QUEUES.EXTRACTION}"`);
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
