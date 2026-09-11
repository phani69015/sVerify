import { hostname } from "node:os";

/**
 * Builds a human-readable Temporal identity string for a worker/client
 * process, e.g. "sverify-ml-worker@my-laptop#41234".
 *
 * By default the Temporal SDK uses just `<hostname>:<pid>` as the identity,
 * which shows up in the Temporal UI (Workers tab, activity/workflow history)
 * as something meaningless like "Tirumalas-MacBook-Pro.local:41234" - hard
 * to tell which of the 6 processes did what. Prefixing with a clear service
 * name fixes that while still keeping the hostname+pid suffix for
 * uniqueness when you run multiple replicas of the same worker.
 */
export function buildIdentity(serviceName: string): string {
  return `${serviceName}@${hostname()}#${process.pid}`;
}
