import { Redis } from "ioredis";
import { env } from "./env.js";

// BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false`
// on the underlying ioredis instance for blocking commands (BRPOPLPUSH).
// We share one connection for the queue producer; BullMQ duplicates it
// internally for blocking ops, and the worker process holds its own.

let _connection: Redis | null = null;

export function redisConnection(): Redis {
  if (_connection) return _connection;
  const conn = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  conn.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[redis] connection error", err.message);
  });
  _connection = conn;
  return conn;
}

export async function closeRedis(): Promise<void> {
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
