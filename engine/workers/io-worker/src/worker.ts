import "dotenv/config";
import { NativeConnection, Worker } from "@temporalio/worker";
import { TASK_QUEUES } from "@sverify/temporal-workflows";
import { buildIdentity } from "@sverify/clients";
import { persistResult } from "./activities/persist-result";

async function main() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    identity: buildIdentity("sverify-io-worker"),
    taskQueue: TASK_QUEUES.IO,
    activities: { persistResult },
  });

  console.log(`io-worker listening on task queue "${TASK_QUEUES.IO}"`);
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
