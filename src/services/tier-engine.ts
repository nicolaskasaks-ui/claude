import type { Prisma, PrismaClient, Tier } from "@prisma/client";

// Decides which tier a card should be in, based on the activity it has
// accumulated within the current rolling tier period (the "qualification
// window" — airlines call this the membership year).
//
// Rules:
//   * Tiers are ranked. Rank 1 is the entry level; higher ranks are better.
//   * Every tier defines BOTH a points threshold and a spend threshold (in
//     minor currency units). A card qualifies for a tier if EITHER threshold
//     is met. This mirrors how airlines accept either miles or qualifying
//     spend.
//   * The card lands in the highest tier it qualifies for.
//   * Once awarded, the tier is locked for the remainder of the current
//     period — a customer cannot lose status mid-period from a refund.
//     Downgrades only happen when the period rolls over.

export type TierEvaluation = {
  card: { periodPoints: number; periodSpend: number; tierId: string };
  newTier: Tier;
  upgraded: boolean;
};

export function pickTier(
  tiers: Tier[],
  periodPoints: number,
  periodSpend: number,
): Tier {
  if (tiers.length === 0) {
    throw new Error("Tenant has no tiers configured");
  }
  // Highest rank wins, evaluated against either threshold.
  const sorted = [...tiers].sort((a, b) => b.rank - a.rank);
  for (const t of sorted) {
    if (periodPoints >= t.qualifyPoints || periodSpend >= t.qualifySpend) {
      return t;
    }
  }
  // Fallback: lowest rank tier (entry level should always have 0 thresholds).
  return sorted[sorted.length - 1]!;
}

export async function evaluateCardTier(
  tx: Prisma.TransactionClient | PrismaClient,
  cardId: string,
): Promise<TierEvaluation> {
  const card = await tx.loyaltyCard.findUniqueOrThrow({
    where: { id: cardId },
    include: { tier: true },
  });
  const tiers = await tx.tier.findMany({ where: { tenantId: card.tenantId } });

  const candidate = pickTier(tiers, card.periodPoints, card.periodSpend);

  // Lock-in: never downgrade mid-period. Only move up.
  if (candidate.rank <= card.tier.rank) {
    return {
      card,
      newTier: card.tier,
      upgraded: false,
    };
  }

  await tx.loyaltyCard.update({
    where: { id: card.id },
    data: { tierId: candidate.id },
  });
  return { card, newTier: candidate, upgraded: true };
}

// Roll a card into a new period. Called by a scheduled job when
// `periodStartedAt + tenant.tierPeriodDays` is in the past. At rollover the
// counters reset and the tier is recomputed against the (now zeroed)
// qualifying activity, so customers who did not requalify will drop a tier.
export async function rollPeriodIfNeeded(
  tx: Prisma.TransactionClient | PrismaClient,
  cardId: string,
  now: Date = new Date(),
): Promise<{ rolled: boolean }> {
  const card = await tx.loyaltyCard.findUniqueOrThrow({
    where: { id: cardId },
    include: { tenant: true },
  });
  const periodEnd = new Date(card.periodStartedAt);
  periodEnd.setDate(periodEnd.getDate() + card.tenant.tierPeriodDays);
  if (now < periodEnd) return { rolled: false };

  const tiers = await tx.tier.findMany({ where: { tenantId: card.tenantId } });
  const fresh = pickTier(tiers, 0, 0);

  await tx.loyaltyCard.update({
    where: { id: card.id },
    data: {
      periodPoints: 0,
      periodSpend: 0,
      periodStartedAt: now,
      tierId: fresh.id,
    },
  });
  return { rolled: true };
}
