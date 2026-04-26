import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole, requireStaff } from "../middleware/auth.js";

const upsertRewardBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  pointsCost: z.number().int().positive(),
  minTierRank: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
});

const patchRewardBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  pointsCost: z.number().int().positive().optional(),
  minTierRank: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

export async function rewardRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireStaff);

  app.get("/v1/rewards", async (req) => {
    return prisma.reward.findMany({
      where: { tenantId: req.staff!.tenantId },
      orderBy: { pointsCost: "asc" },
    });
  });

  app.post(
    "/v1/rewards",
    { onRequest: [requireRole("OWNER", "MANAGER")] },
    async (req) => {
      const body = upsertRewardBody.parse(req.body);
      return prisma.reward.create({
        data: { ...body, tenantId: req.staff!.tenantId },
      });
    },
  );

  app.patch(
    "/v1/rewards/:id",
    { onRequest: [requireRole("OWNER", "MANAGER")] },
    async (req) => {
      const { id } = req.params as { id: string };
      const tenantId = req.staff!.tenantId;
      await prisma.reward.findFirstOrThrow({ where: { id, tenantId } });
      const body = patchRewardBody.parse(req.body);
      return prisma.reward.update({ where: { id }, data: body });
    },
  );

  // Soft-delete is preferred (set active=false) since past redemptions reference
  // rewards by name in transaction notes; this hard-delete is for cleanup.
  app.delete(
    "/v1/rewards/:id",
    { onRequest: [requireRole("OWNER", "MANAGER")] },
    async (req) => {
      const { id } = req.params as { id: string };
      const tenantId = req.staff!.tenantId;
      await prisma.reward.findFirstOrThrow({ where: { id, tenantId } });
      await prisma.reward.delete({ where: { id } });
      return { ok: true };
    },
  );
}
