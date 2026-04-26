import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "./lib/env.js";
import { HttpError } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { customerRoutes } from "./routes/customers.js";
import { cardRoutes } from "./routes/cards.js";
import { giftCardRoutes } from "./routes/gift-cards.js";
import { tierRoutes } from "./routes/tiers.js";
import { rewardRoutes } from "./routes/rewards.js";
import { terminalRoutes } from "./routes/terminal.js";
import { terminalAdminRoutes } from "./routes/terminals-admin.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { walletRoutes } from "./routes/wallet.js";
import { publicRoutes, customerLookupRoutes } from "./routes/public.js";
import { adminRoutes } from "./routes/admin.js";
import { startWalletPushWorker } from "./workers/wallet-push.js";

export function buildServer() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });

  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, { origin: true });
  app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.get("/health", async () => ({ status: "ok" }));

  // Static pages: customer enrollment landing + cashier POS. We resolve the
  // path relative to the running file so it works in dev (tsx) and in the
  // built dist/ output the same way.
  const here = dirname(fileURLToPath(import.meta.url));
  app.register(staticPlugin, {
    root: join(here, "..", "public"),
    prefix: "/app/",
    decorateReply: false,
  });

  app.register(publicRoutes);
  app.register(customerLookupRoutes);
  app.register(authRoutes);
  app.register(customerRoutes);
  app.register(cardRoutes);
  app.register(giftCardRoutes);
  app.register(tierRoutes);
  app.register(rewardRoutes);
  app.register(terminalRoutes);
  app.register(terminalAdminRoutes);
  app.register(campaignRoutes);
  app.register(walletRoutes);
  app.register(adminRoutes);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code ?? "error", message: err.message });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "validation", issues: err.flatten() });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") return reply.code(409).send({ error: "conflict" });
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
    }
    req.log.error(err);
    return reply.code(500).send({
      error: "internal_server_error",
      message: err.message,
      ...(env.NODE_ENV !== "production" && err.stack ? { stack: err.stack } : {}),
    });
  });

  return app;
}

async function main() {
  const app = buildServer();
  // The inline worker is opt-in (RUN_WORKER_INLINE=true) AND requires Redis.
  // On Vercel we run without Redis and use direct fire-and-forget pushes
  // from the request handler instead.
  const hasRedis = !!process.env.REDIS_URL;
  if (env.RUN_WORKER_INLINE && hasRedis) {
    startWalletPushWorker();
    app.log.info("[wallet-push:worker] running inline with HTTP server");
  }
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  void main();
}
