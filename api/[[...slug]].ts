import type { IncomingMessage, ServerResponse } from "node:http";
import { buildServer } from "../src/server.js";

// Vercel serverless adapter for Fastify.
//
// Vercel routes everything under /api/* to this catch-all function. We strip
// the /api prefix before handing the request to Fastify so the existing
// route definitions (registered as /v1/..., /health, etc.) keep matching.
//
// vercel.json adds rewrites so end-user URLs like /v1/auth/staff/login map
// to /api/v1/auth/staff/login under the hood, keeping client code (HTML
// fetches) free of any /api prefix.

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
  if (req.url && req.url.startsWith("/api")) {
    req.url = req.url.slice(4) || "/";
  }
  app.server.emit("request", req, res);
}
