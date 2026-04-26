import type { IncomingMessage, ServerResponse } from "node:http";
import { buildServer } from "../src/server.js";

// Wraps the same Fastify app as api/v1/[...slug].ts but lives at the root
// of /api/ so single-segment paths (/api/health) reach Fastify too. Vercel's
// catch-all only matches multi-segment paths reliably when nested under a
// folder, so /health gets its own file.

let appPromise: Promise<Awaited<ReturnType<typeof buildServer>>> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const app = buildServer();
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const app = await getApp();
  // The function is at /api/health, but Fastify expects /health.
  req.url = "/health";
  app.server.emit("request", req, res);
}
