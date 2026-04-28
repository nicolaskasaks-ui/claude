import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireStaff } from "../middleware/auth.js";
import { issueGiftCard, redeemGiftCard } from "../services/gift-cards.js";

const issueBody = z.object({
  initialAmountCents: z.number().int().positive(),
  customerId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
});

const redeemBody = z.object({
  amountCents: z.number().int().positive(),
  locationId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  // Required only when the gift card was issued with a PIN.
  pin: z.string().regex(/^\d{4,8}$/).optional(),
});

export async function giftCardRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireStaff);

  app.post("/v1/gift-cards", async (req) => {
    const body = issueBody.parse(req.body);
    return issueGiftCard({
      tenantId: req.staff!.tenantId,
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
  });

  app.get("/v1/gift-cards/:id", async (req) => {
    const { id } = req.params as { id: string };
    return prisma.giftCard.findFirstOrThrow({
      where: { id, tenantId: req.staff!.tenantId },
    });
  });

  app.post("/v1/gift-cards/:id/redeem", async (req) => {
    const { id } = req.params as { id: string };
    const body = redeemBody.parse(req.body);
    return redeemGiftCard({
      tenantId: req.staff!.tenantId,
      giftCardId: id,
      ...body,
    });
  });
}
