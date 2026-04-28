import { prisma } from "../lib/prisma.js";
import { generateNfcSerial } from "../lib/ids.js";
import { BadRequest, Conflict, NotFound } from "../lib/errors.js";
import { evaluateCardTier, pickTier, rollPeriodIfNeeded } from "./tier-engine.js";
import { enqueuePassUpdate } from "./wallet-push.js";

// Brand-aligned welcome copy when a card is promoted to a higher tier. Each
// message is short on purpose — iOS truncates lock-screen notifications.
function tierWelcomeCopy(tierName: string): string {
  switch (tierName) {
    case "Gold":
      return "Subiste a Gold. Tus nuevos beneficios ya están activos.";
    case "Platinum":
      return "Subiste a Platinum. Acceso a Mesa del Chef y prioridad en lista.";
    default:
      return `Bienvenido a ${tierName} de Chuí.`;
  }
}

// Issuing, accruing and redeeming on a customer's loyalty card.
//
// Every state-changing operation runs inside a serializable Prisma transaction
// so concurrent taps from different terminals can never double-credit or
// double-spend the same card.

export async function issueCard(input: {
  tenantId: string;
  customerId: string;
}) {
  const tiers = await prisma.tier.findMany({ where: { tenantId: input.tenantId } });
  if (tiers.length === 0) {
    throw BadRequest("Tenant has no tiers configured");
  }
  const entry = pickTier(tiers, 0, 0);

  const existing = await prisma.loyaltyCard.findFirst({
    where: { tenantId: input.tenantId, customerId: input.customerId, status: "ACTIVE" },
  });
  if (existing) throw Conflict("Customer already has an active card");

  return prisma.loyaltyCard.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      tierId: entry.id,
      nfcSerial: generateNfcSerial(),
    },
    include: { tier: true, customer: true },
  });
}

// Earn points from a sale. `amountCents` is the total spent; the points are
// derived from the tenant's earn rate (1 point per minor currency unit by
// default) multiplied by the customer's current tier multiplier.
export async function accrueFromSale(input: {
  tenantId: string;
  cardId: string;
  amountCents: number;
  locationId?: string;
  idempotencyKey?: string;
  note?: string;
}) {
  if (input.amountCents <= 0) throw BadRequest("amountCents must be positive");

  return prisma.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const dup = await tx.transaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (dup) return dup;
    }

    await rollPeriodIfNeeded(tx, input.cardId);

    const card = await tx.loyaltyCard.findUniqueOrThrow({
      where: { id: input.cardId },
      include: { tier: true },
    });
    if (card.tenantId !== input.tenantId) throw NotFound("Card not in tenant");
    if (card.status !== "ACTIVE") throw BadRequest("Card is not active");

    // 1 point per dollar (i.e. per 100 cents) by default, multiplied by tier.
    const baseUnits = Math.floor(input.amountCents / 100);
    const earned = Math.floor(baseUnits * card.tier.pointsMultiplier);

    await tx.loyaltyCard.update({
      where: { id: card.id },
      data: {
        pointsBalance: { increment: earned },
        periodPoints: { increment: earned },
        periodSpend: { increment: input.amountCents },
      },
    });

    const txRow = await tx.transaction.create({
      data: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        customerId: card.customerId,
        cardId: card.id,
        kind: "EARN",
        amountCents: input.amountCents,
        pointsDelta: earned,
        note: input.note,
        idempotencyKey: input.idempotencyKey,
      },
    });

    const evaluation = await evaluateCardTier(tx, card.id);
    if (evaluation.upgraded) {
      // Tier upgrade: message rendered by iOS as a lock-screen notification
      // when the pass back field "Membresía" updates (changeMessage="Bienvenido a %@").
      // We pass the raw tier name; the changeMessage template wraps it.
      await enqueuePassUpdate(tx, card.id, {
        reason: "tier_upgraded",
        message: tierWelcomeCopy(evaluation.newTier.name),
      });
    } else {
      await enqueuePassUpdate(tx, card.id, { reason: "balance_changed" });
    }

    return txRow;
  });
}

export async function redeemReward(input: {
  tenantId: string;
  cardId: string;
  rewardId: string;
  locationId?: string;
  idempotencyKey?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const card = await tx.loyaltyCard.findUniqueOrThrow({
      where: { id: input.cardId },
      include: { tier: true },
    });
    if (card.tenantId !== input.tenantId) throw NotFound("Card not in tenant");
    if (card.status !== "ACTIVE") throw BadRequest("Card is not active");

    const reward = await tx.reward.findUniqueOrThrow({ where: { id: input.rewardId } });
    if (reward.tenantId !== input.tenantId) throw NotFound("Reward not in tenant");
    if (!reward.active) throw BadRequest("Reward is not active");
    if (card.tier.rank < reward.minTierRank) {
      throw BadRequest("Card tier is below the reward's minimum");
    }
    // ADHOC rewards (birthday, referral, welcome drink) are bound to a card
    // and are one-shot. Block redemption if already claimed or past expiry,
    // and verify the binding so a Customer can't claim someone else's gift.
    if (reward.kind === "ADHOC") {
      if (reward.claimedAt) throw BadRequest("Reward already claimed");
      if (reward.expiresAt && reward.expiresAt < new Date()) {
        throw BadRequest("Reward has expired");
      }
      if (reward.cardId && reward.cardId !== card.id) {
        throw BadRequest("Reward not bound to this card");
      }
    }
    if (card.pointsBalance < reward.pointsCost) {
      throw BadRequest("Insufficient points balance");
    }

    await tx.loyaltyCard.update({
      where: { id: card.id },
      data: { pointsBalance: { decrement: reward.pointsCost } },
    });

    if (reward.kind === "ADHOC") {
      await tx.reward.update({
        where: { id: reward.id },
        data: { claimedAt: new Date() },
      });
    }

    const txRow = await tx.transaction.create({
      data: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        customerId: card.customerId,
        cardId: card.id,
        kind: "REDEEM_REWARD",
        pointsDelta: -reward.pointsCost,
        note: reward.name,
        idempotencyKey: input.idempotencyKey,
      },
    });

    await enqueuePassUpdate(tx, card.id, { reason: "balance_changed" });
    return txRow;
  });
}
