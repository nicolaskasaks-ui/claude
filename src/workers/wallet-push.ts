import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "../lib/redis.js";
import {
  WALLET_PUSH_QUEUE,
  type WalletPushJobData,
} from "../queues/wallet-push.js";
import { pushApplePassUpdate } from "../services/apns.js";
import { pushGooglePassUpdate } from "../services/wallet-google.js";

// Single worker that fans a wallet-pass-update job out to both Apple (APNs
// empty-payload push) and Google (Wallet Objects PATCH) in parallel. Either
// provider failing does NOT fail the job unless BOTH fail — that way one
// misconfigured provider doesn't poison retries for the other.

async function processJob(job: Job<WalletPushJobData>): Promise<void> {
  const { cardId, message } = job.data;

  const results = await Promise.allSettled([
    pushApplePassUpdate(cardId),
    pushGooglePassUpdate(cardId, message),
  ]);

  const failures = results.filter((r) => r.status === "rejected");
  for (const r of results) {
    if (r.status === "rejected") {
      // eslint-disable-next-line no-console
      console.error(`[wallet-push:worker] provider failed card=${cardId}`, r.reason);
    }
  }
  if (failures.length === results.length) {
    // Both providers failed — surface to BullMQ for retry.
    throw new Error(
      `All wallet providers failed for card=${cardId}: ${failures
        .map((f) => (f as PromiseRejectedResult).reason?.message ?? "unknown")
        .join("; ")}`,
    );
  }
}

export function startWalletPushWorker(): Worker<WalletPushJobData> {
  const worker = new Worker<WalletPushJobData>(
    WALLET_PUSH_QUEUE,
    processJob,
    {
      connection: redisConnection(),
      concurrency: 5,
    },
  );
  worker.on("completed", (job) => {
    // eslint-disable-next-line no-console
    console.log(`[wallet-push:worker] done card=${job.data.cardId} reason=${job.data.reason}`);
  });
  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[wallet-push:worker] failed card=${job?.data.cardId} attempt=${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`,
    );
  });
  return worker;
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  // eslint-disable-next-line no-console
  console.log("[wallet-push:worker] starting standalone worker");
  startWalletPushWorker();
}
