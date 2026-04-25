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
}
