import "dotenv/config";
import { NativeConnection, Worker } from "@temporalio/worker";
import { TASK_QUEUES } from "@sverify/temporal-workflows";
import { buildIdentity } from "@sverify/clients";
import { detectDeepfake } from "./activities/detect-deepfake";
import { transcribeAudio } from "./activities/transcribe-audio";

async function main() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    identity: buildIdentity("sverify-ml-worker"),
    taskQueue: TASK_QUEUES.ML,
    activities: { detectDeepfake, transcribeAudio },
  });

  console.log(`ml-worker listening on task queue "${TASK_QUEUES.ML}"`);
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
