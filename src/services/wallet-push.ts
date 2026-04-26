import type { Prisma, PrismaClient } from "@prisma/client";
import { walletPushQueue, type PassUpdateReason } from "../queues/wallet-push.js";

// Wallet pass updates double as our push channel: changing any field on a
// pass causes Apple Wallet (via APNs targeted at the device tokens we
// captured during registration) and Google Wallet (via the Wallet Objects
// PATCH API) to surface a lock-screen notification.
//
// `enqueuePassUpdate` is intentionally fire-and-forget: it pushes a job to
// BullMQ via setImmediate so the surrounding DB transaction commits before
// the worker can read the card. Job execution, retries and dead-lettering
// are handled by the dedicated wallet-push worker.

export type { PassUpdateReason };

export async function enqueuePassUpdate(
  _tx: Prisma.TransactionClient | PrismaClient,
  cardId: string,
  meta: { reason: PassUpdateReason; message?: string },
): Promise<void> {
  // setImmediate yields control back to the event loop so that, when called
  // from inside a $transaction callback, the commit completes before the
  // worker picks up the job and reads the (now-fresh) card row.
  setImmediate(() => {
    walletPushQueue()
      .add(
        meta.reason,
        { cardId, reason: meta.reason, message: meta.message },
        { jobId: `${cardId}:${meta.reason}:${Date.now()}` },
      )
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[wallet-push] enqueue failed", err);
      });
  });

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[wallet-push] queue card=${cardId} reason=${meta.reason}`);
  }
}
