import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { Unauthorized } from "../lib/errors.js";

// Endpoints invoked by Vercel Cron on a schedule. The schedule lives in
// vercel.json under "crons". Vercel sends `Authorization: Bearer <secret>`
// where the secret is the CRON_SECRET env var; we reject anything that
// doesn't match so a public caller cannot trigger maintenance jobs.

function requireCron(req: FastifyRequest, _reply: FastifyReply) {
  if (!env.CRON_SECRET) {
    throw Unauthorized("CRON_SECRET not configured");
  }
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    throw Unauthorized();
  }
}

export async function cronRoutes(app: FastifyInstance) {
  // Sweep gift card purchases that never reached PAID. The public flow
  // creates a row up front so MP gets a stable external reference, but if
  // the buyer abandons checkout (or MP create fails) the row sits in PENDING
  // forever. Anything older than 24h with no giftCard linked is junk.
  app.get("/v1/cron/cleanup-pending-purchases", {
    preHandler: [requireCron],
  }, async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await prisma.giftCardPurchase.deleteMany({
      where: {
        status: "PENDING",
        giftCardId: null,
        createdAt: { lt: cutoff },
      },
    });
    return { ok: true, deleted: result.count, cutoff: cutoff.toISOString() };
  });
}
