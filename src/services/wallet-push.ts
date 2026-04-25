import type { Prisma, PrismaClient } from "@prisma/client";

// Wallet pass updates double as our push channel: changing any field on a
// pass causes Apple Wallet (via APNs targeted at the device tokens we
// captured during registration) and Google Wallet (via the Wallet Objects
// PATCH API) to surface a lock-screen notification.
//
// This module is the in-process queue of those updates. In production we'd
// hand them off to a worker (BullMQ or similar) that talks to APNs and
// Google's REST API. For now we simply mark devices as needing an update;
// the Apple PassKit web service exposes the latest version when iPhones poll
// after receiving the empty APNs payload.

export type PassUpdateReason =
  | "tier_upgraded"
  | "balance_changed"
  | "campaign";

export async function enqueuePassUpdate(
  _tx: Prisma.TransactionClient | PrismaClient,
  cardId: string,
  meta: { reason: PassUpdateReason; message?: string },
): Promise<void> {
  // Stub: in production this enqueues a job that:
  //   1. For each Apple device registered against this card, send an empty
  //      APNs payload (per Apple PassKit web service spec). The phone will
  //      then call GET /v1/passes/:passTypeId/:serial and we return the
  //      updated bundle.
  //   2. For each Google object backing this card, call PATCH on
  //      walletobjects.googleapis.com with the new field values. Google
  //      handles the user-facing notification.
  // We intentionally do not block the calling transaction on the network.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[wallet-push] queue card=${cardId} reason=${meta.reason}`);
  }
}

export async function sendApnsToDevice(_pushToken: string): Promise<void> {
  // Apple PassKit pushes are empty notifications (no payload). They use the
  // pass-type-id certificate as the APNs auth credential. Implemented by a
  // worker; left as a stub here to keep the HTTP path simple.
}
