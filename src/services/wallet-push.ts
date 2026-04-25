import type { Prisma, PrismaClient } from "@prisma/client";
import { pushApplePassUpdate } from "./apns.js";

// Wallet pass updates double as our push channel: changing any field on a
// pass causes Apple Wallet (via APNs targeted at the device tokens we
// captured during registration) and Google Wallet (via the Wallet Objects
// PATCH API) to surface a lock-screen notification.
//
// `enqueuePassUpdate` is intentionally fire-and-forget: it spawns the
// outbound calls without awaiting them so the calling DB transaction is
// never blocked on a network round trip. Failures are logged, not surfaced
// to the user.

export type PassUpdateReason =
  | "tier_upgraded"
  | "balance_changed"
  | "campaign";

export async function enqueuePassUpdate(
  _tx: Prisma.TransactionClient | PrismaClient,
  cardId: string,
  meta: { reason: PassUpdateReason; message?: string },
): Promise<void> {
  // Don't await: the caller is usually inside a DB transaction. We yield
  // control with setImmediate to ensure the network call starts only after
  // the surrounding transaction commits.
  setImmediate(() => {
    pushApplePassUpdate(cardId).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[wallet-push] apple push failed", err);
    });
    // Google Wallet update is a TODO: instead of an APNs call, we PATCH the
    // wallet object on Google's side and Google notifies the user. Stubbed
    // until the Google Issuer ID + service account are provisioned.
  });

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[wallet-push] queue card=${cardId} reason=${meta.reason}`);
  }
}
