import type { IncomingMessage, ServerResponse } from "node:http";
import { buildServer } from "../src/server.js";

// Single Vercel serverless entrypoint. vercel.json's routes config sends all
// non-static paths here, preserving the original URL on req.url so Fastify's
// existing route table (/v1/..., /health, /v1/wallet/apple/...) keeps
// matching without any prefix stripping.

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
  app.server.emit("request", req, res);
}
