import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireStaff } from "../middleware/auth.js";
import { accrueFromSale, redeemReward } from "../services/loyalty.js";

const earnBody = z.object({
  amountCents: z.number().int().positive(),
  locationId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  note: z.string().optional(),
});

const redeemBody = z.object({
  rewardId: z.string(),
  locationId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export async function cardRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireStaff);

  app.get("/v1/cards/:id", async (req) => {
    const { id } = req.params as { id: string };
    return prisma.loyaltyCard.findFirstOrThrow({
      where: { id, tenantId: req.staff!.tenantId },
      include: { tier: true, customer: true },
    });
  });

  app.post("/v1/cards/:id/earn", async (req) => {
    const { id } = req.params as { id: string };
    const body = earnBody.parse(req.body);
    return accrueFromSale({
      tenantId: req.staff!.tenantId,
      cardId: id,
      ...body,
    });
  });

  app.post("/v1/cards/:id/redeem", async (req) => {
    const { id } = req.params as { id: string };
    const body = redeemBody.parse(req.body);
    return redeemReward({
      tenantId: req.staff!.tenantId,
      cardId: id,
      ...body,
    });
  });

  app.get("/v1/cards/:id/transactions", async (req) => {
    const { id } = req.params as { id: string };
    return prisma.transaction.findMany({
      where: { cardId: id, tenantId: req.staff!.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
}
