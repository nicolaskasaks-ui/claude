import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole, requireStaff } from "../middleware/auth.js";
import { Conflict } from "../lib/errors.js";

const upsertTierBody = z.object({
  name: z.string().min(1),
  rank: z.number().int().positive(),
  qualifyPoints: z.number().int().nonnegative().default(0),
  qualifySpend: z.number().int().nonnegative().default(0),
  discountPct: z.number().int().min(0).max(100).default(0),
  pointsMultiplier: z.number().positive().default(1),
  color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).default("#C0C0C0"),
});

export async function tierRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireStaff);

  app.get("/v1/tiers", async (req) => {
    return prisma.tier.findMany({
      where: { tenantId: req.staff!.tenantId },
      orderBy: { rank: "asc" },
    });
  });

  app.post(
    "/v1/tiers",
    { onRequest: [requireRole("OWNER", "MANAGER")] },
    async (req) => {
      const body = upsertTierBody.parse(req.body);
      return prisma.tier.upsert({
        where: { tenantId_rank: { tenantId: req.staff!.tenantId, rank: body.rank } },
        update: body,
        create: { ...body, tenantId: req.staff!.tenantId },
      });
    },
  );

  // Delete a tier. Refuses if any cards still belong to it — staff has to
  // reassign first by editing the card or running a migration script.
  app.delete(
    "/v1/tiers/:rank",
    { onRequest: [requireRole("OWNER")] },
    async (req) => {
      const rank = Number((req.params as { rank: string }).rank);
      const tenantId = req.staff!.tenantId;
      const tier = await prisma.tier.findUnique({
        where: { tenantId_rank: { tenantId, rank } },
      });
      if (!tier) {
        return { ok: true, deleted: false };
      }
      const cardCount = await prisma.loyaltyCard.count({
        where: { tierId: tier.id },
      });
      if (cardCount > 0) {
        throw Conflict(
          `Tier "${tier.name}" still has ${cardCount} card(s); reassign before deleting.`,
        );
      }
      await prisma.tier.delete({ where: { id: tier.id } });
      return { ok: true, deleted: true };
    },
  );
}
