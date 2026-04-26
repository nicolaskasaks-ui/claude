import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export type PassUpdateReason =
  | "tier_upgraded"
  | "balance_changed"
  | "campaign";

export interface WalletPushJobData {
  cardId: string;
  reason: PassUpdateReason;
  message?: string;
}

export const WALLET_PUSH_QUEUE = "wallet-push";

let _queue: Queue<WalletPushJobData> | null = null;

export function walletPushQueue(): Queue<WalletPushJobData> {
  if (_queue) return _queue;
  _queue = new Queue<WalletPushJobData>(WALLET_PUSH_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  return _queue;
}
