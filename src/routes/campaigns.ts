import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole, requireStaff } from "../middleware/auth.js";
import { createCampaign, sendCampaign } from "../services/campaigns.js";
import { Conflict } from "../lib/errors.js";

const createBody = z.object({
  title: z.string().min(1),
  message: z.string().min(1).max(280),
  // Empty array (or omit) = all active cardholders. Otherwise the list of
  // tier ranks (e.g. [2,3] for Gold + Platinum).
  targetTierRanks: z.array(z.number().int().positive()).default([]),
  scheduledFor: z.string().datetime().optional(),
});

const patchBody = z.object({
  title: z.string().min(1).optional(),
  message: z.string().min(1).max(280).optional(),
  targetTierRanks: z.array(z.number().int().positive()).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
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

  // Edit / cancel only while still a draft. Once SENDING/SENT we keep the
  // record immutable so deliveries stay auditable.
  app.patch(
    "/v1/campaigns/:id",
    { onRequest: [requireRole("OWNER", "MANAGER")] },
    async (req) => {
      const { id } = req.params as { id: string };
      const tenantId = req.staff!.tenantId;
      const body = patchBody.parse(req.body);
      const existing = await prisma.campaign.findFirstOrThrow({
        where: { id, tenantId },
      });
      if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
        throw Conflict(`Cannot edit campaign in status ${existing.status}`);
      }
      return prisma.campaign.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.message !== undefined ? { message: body.message } : {}),
          ...(body.targetTierRanks !== undefined
            ? { targetTierRanks: body.targetTierRanks }
            : {}),
          ...(body.scheduledFor !== undefined
            ? {
                scheduledFor: body.scheduledFor
                  ? new Date(body.scheduledFor)
                  : null,
              }
            : {}),
        },
      });
    },
  );

  // Clone any campaign (including SENT ones) into a fresh DRAFT so staff can
  // re-send the same content without re-typing. Useful for recurring promos.
  app.post(
    "/v1/campaigns/:id/duplicate",
    { onRequest: [requireRole("OWNER", "MANAGER")] },
    async (req) => {
      const { id } = req.params as { id: string };
      const tenantId = req.staff!.tenantId;
      const original = await prisma.campaign.findFirstOrThrow({
        where: { id, tenantId },
      });
      return prisma.campaign.create({
        data: {
          tenantId,
          title: original.title,
          message: original.message,
          targetTierRanks: original.targetTierRanks,
          status: "DRAFT",
        },
      });
    },
  );

  app.delete(
    "/v1/campaigns/:id",
    { onRequest: [requireRole("OWNER", "MANAGER")] },
    async (req) => {
      const { id } = req.params as { id: string };
      const tenantId = req.staff!.tenantId;
      const existing = await prisma.campaign.findFirstOrThrow({
        where: { id, tenantId },
      });
      if (existing.status === "SENT" || existing.status === "SENDING") {
        throw Conflict(`Cannot delete campaign in status ${existing.status}`);
      }
      await prisma.campaign.delete({ where: { id } });
      return { ok: true };
    },
  );
}
