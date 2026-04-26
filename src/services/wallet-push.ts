import type { Prisma, PrismaClient } from "@prisma/client";
import type { PassUpdateReason } from "../queues/wallet-push.js";
import { pushApplePassUpdate } from "./apns.js";
import { pushGooglePassUpdate } from "./wallet-google.js";

// Wallet pass updates double as our push channel: changing any field on a
// pass causes Apple Wallet (via APNs targeted at the device tokens we
// captured during registration) and Google Wallet (via the Wallet Objects
// PATCH API) to surface a lock-screen notification.
//
// `enqueuePassUpdate` has two modes:
//
//   1. With Redis configured (REDIS_URL set + worker running) — it pushes a
//      job to a BullMQ queue. The dedicated worker handles retries and
//      dead-lettering.
//
//   2. Without Redis (Vercel serverless / cheap dev) — it does a direct
//      fire-and-forget push. No retries, but the request handler returns
//      immediately and the push completes in the background.
//
// In both cases we yield with setImmediate so any surrounding DB transaction
// commits before the network round trip starts.

export type { PassUpdateReason };

const HAS_REDIS = !!process.env.REDIS_URL && process.env.RUN_WORKER_INLINE !== "false-vercel";

async function pushDirect(
  cardId: string,
  meta: { reason: PassUpdateReason; message?: string },
): Promise<void> {
  const results = await Promise.allSettled([
    pushApplePassUpdate(cardId),
    pushGooglePassUpdate(cardId, meta.message),
  ]);
  for (const r of results) {
    if (r.status === "rejected") {
      // eslint-disable-next-line no-console
      console.error(`[wallet-push] direct provider failed card=${cardId}`, r.reason);
    }
  }
}

export async function enqueuePassUpdate(
  _tx: Prisma.TransactionClient | PrismaClient,
  cardId: string,
  meta: { reason: PassUpdateReason; message?: string },
): Promise<void> {
  // Lazy-import the queue module so deployments without Redis don't even
  // open a connection. The import happens once per process the first time
  // a queue-mode push is needed.
  if (HAS_REDIS) {
    setImmediate(async () => {
      try {
        const { walletPushQueue } = await import("../queues/wallet-push.js");
        await walletPushQueue().add(
          meta.reason,
          { cardId, reason: meta.reason, message: meta.message },
          { jobId: `${cardId}:${meta.reason}:${Date.now()}` },
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[wallet-push] enqueue failed; falling back to direct", err);
        await pushDirect(cardId, meta);
      }
    });
  } else {
    setImmediate(() => {
      pushDirect(cardId, meta).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[wallet-push] direct push failed", err);
      });
    });
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(
      `[wallet-push] ${HAS_REDIS ? "queued" : "direct"} card=${cardId} reason=${meta.reason}`,
    );
  }
}
