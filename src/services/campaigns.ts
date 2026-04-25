import { prisma } from "../lib/prisma.js";
import { BadRequest, NotFound } from "../lib/errors.js";
import { enqueuePassUpdate } from "./wallet-push.js";

// Campaigns are tier-targeted marketing messages delivered through the wallet
// pass itself: we mutate a `messages` field on every matching card and the
// wallet (Apple / Google) shows the updated value as a lock-screen
// notification. No separate native app is required.
//
// `targetTierRanks` is a list of tier ranks to target (e.g. [2,3] = Gold and
// Platinum). An empty list means everyone with an active card.

export async function createCampaign(input: {
  tenantId: string;
  title: string;
  message: string;
  targetTierRanks?: number[];
  scheduledFor?: Date;
}) {
  if (!input.title.trim()) throw BadRequest("title is required");
  if (!input.message.trim()) throw BadRequest("message is required");
  if (input.message.length > 280) throw BadRequest("message is too long (max 280 chars)");

  return prisma.campaign.create({
    data: {
      tenantId: input.tenantId,
      title: input.title,
      message: input.message,
      targetTierRanks: input.targetTierRanks ?? [],
      status: input.scheduledFor ? "SCHEDULED" : "DRAFT",
      scheduledFor: input.scheduledFor,
    },
  });
}

// Resolve which loyalty cards match a campaign's targeting at send time. We
// resolve at send-time rather than at create-time so a customer who upgrades
// to Gold the day before a Gold-only promo is included automatically.
async function resolveAudience(
  tenantId: string,
  targetTierRanks: number[],
): Promise<{ id: string }[]> {
  if (targetTierRanks.length === 0) {
    return prisma.loyaltyCard.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true },
    });
  }
  const tiers = await prisma.tier.findMany({
    where: { tenantId, rank: { in: targetTierRanks } },
    select: { id: true },
  });
  return prisma.loyaltyCard.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      tierId: { in: tiers.map((t) => t.id) },
    },
    select: { id: true },
  });
}

export async function sendCampaign(input: { tenantId: string; campaignId: string }) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: input.campaignId },
  });
  if (campaign.tenantId !== input.tenantId) throw NotFound("Campaign not in tenant");
  if (campaign.status === "SENT") throw BadRequest("Campaign already sent");
  if (campaign.status === "SENDING") throw BadRequest("Campaign already in flight");

  const audience = await resolveAudience(campaign.tenantId, campaign.targetTierRanks);

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "SENDING" },
  });

  // Pre-create delivery rows so retries are idempotent.
  await prisma.campaignDelivery.createMany({
    data: audience.map((c) => ({ campaignId: campaign.id, cardId: c.id })),
    skipDuplicates: true,
  });

  for (const c of audience) {
    try {
      await enqueuePassUpdate(prisma, c.id, {
        reason: "campaign",
        message: campaign.message,
      });
      await prisma.campaignDelivery.update({
        where: { campaignId_cardId: { campaignId: campaign.id, cardId: c.id } },
        data: { status: "SENT", sentAt: new Date() },
      });
    } catch (err) {
      await prisma.campaignDelivery.update({
        where: { campaignId_cardId: { campaignId: campaign.id, cardId: c.id } },
        data: { status: "FAILED", error: String(err) },
      });
    }
  }

  return prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "SENT", sentAt: new Date() },
  });
}
