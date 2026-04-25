import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole, requireStaff } from "../middleware/auth.js";
import { createCampaign, sendCampaign } from "../services/campaigns.js";

const createBody = z.object({
  title: z.string().min(1),
  message: z.string().min(1).max(280),
  // Empty array (or omit) = all active cardholders. Otherwise the list of
  // tier ranks (e.g. [2,3] for Gold + Platinum).
  targetTierRanks: z.array(z.number().int().positive()).default([]),
  scheduledFor: z.string().datetime().optional(),
});

export async function campaignRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireStaff);

  app.get("/v1/campaigns", async (req) => {
    return prisma.campaign.findMany({
      where: { tenantId: req.staff!.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  app.post(
    "/v1/campaigns",
    { onRequest: [requireRole("OWNER", "MANAGER")] },
    async (req) => {
      const body = createBody.parse(req.body);
      return createCampaign({
        tenantId: req.staff!.tenantId,
        title: body.title,
        message: body.message,
        targetTierRanks: body.targetTierRanks,
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : undefined,
      });
    },
  );

  app.post(
    "/v1/campaigns/:id/send",
    { onRequest: [requireRole("OWNER", "MANAGER")] },
    async (req) => {
      const { id } = req.params as { id: string };
      return sendCampaign({ tenantId: req.staff!.tenantId, campaignId: id });
    },
  );

  app.get("/v1/campaigns/:id/deliveries", async (req) => {
    const { id } = req.params as { id: string };
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id, tenantId: req.staff!.tenantId },
    });
    return prisma.campaignDelivery.findMany({
      where: { campaignId: campaign.id },
      take: 500,
    });
  });
}
