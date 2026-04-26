import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole, requireStaff } from "../middleware/auth.js";

// Admin-only routes used by the panel: a paginated transaction log, simple
// dashboard KPIs, and tenant branding edits. All scoped to the staff JWT's
// tenant — there is no cross-tenant access here.

const txQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  kind: z
    .enum([
      "EARN",
      "REDEEM_REWARD",
      "TIER_DISCOUNT",
      "GIFT_LOAD",
      "GIFT_REDEEM",
      "ADJUSTMENT",
      "REVERSAL",
    ])
    .optional(),
  customerId: z.string().optional(),
  cardId: z.string().optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
});

const updateTenantBody = z.object({
  name: z.string().min(1).optional(),
  brandColor: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
  logoUrl: z.string().url().nullable().optional(),
  currency: z.string().length(3).optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireStaff);
  app.addHook("onRequest", requireRole("OWNER", "MANAGER"));

  // Cursor-paginated ledger. Cursor is the previous page's last transaction id.
  app.get("/v1/admin/transactions", async (req) => {
    const q = txQuery.parse(req.query);
    const tenantId = req.staff!.tenantId;
    const items = await prisma.transaction.findMany({
      where: {
        tenantId,
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
        ...(q.cardId ? { cardId: q.cardId } : {}),
        ...(q.since || q.until
          ? {
              createdAt: {
                ...(q.since ? { gte: new Date(q.since) } : {}),
                ...(q.until ? { lte: new Date(q.until) } : {}),
              },
            }
          : {}),
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
        card: { select: { id: true, nfcSerial: true } },
      },
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > q.limit;
    const page = hasMore ? items.slice(0, q.limit) : items;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  });

  // Dashboard KPIs over the trailing 30 days.
  app.get("/v1/admin/stats", async (req) => {
    const tenantId = req.staff!.tenantId;
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [pointsAgg, redeemAgg, spendAgg, tiersWithCounts, topRewardsRaw] =
      await Promise.all([
        prisma.transaction.aggregate({
          where: { tenantId, kind: "EARN", createdAt: { gte: since } },
          _sum: { pointsDelta: true },
          _count: true,
        }),
        prisma.transaction.aggregate({
          where: {
            tenantId,
            kind: "REDEEM_REWARD",
            createdAt: { gte: since },
          },
          _sum: { pointsDelta: true },
          _count: true,
        }),
        prisma.transaction.aggregate({
          where: { tenantId, kind: "EARN", createdAt: { gte: since } },
          _sum: { amountCents: true },
        }),
        prisma.tier.findMany({
          where: { tenantId },
          orderBy: { rank: "asc" },
          include: { _count: { select: { cards: true } } },
        }),
        prisma.transaction.groupBy({
          by: ["note"],
          where: {
            tenantId,
            kind: "REDEEM_REWARD",
            createdAt: { gte: since },
            note: { not: null },
          },
          _count: { _all: true },
          orderBy: { _count: { note: "desc" } },
          take: 5,
        }),
      ]);

    return {
      windowDays: 30,
      totals: {
        // EARN pointsDelta is positive; REDEEM is negative — surface absolute values.
        pointsIssued: pointsAgg._sum.pointsDelta ?? 0,
        pointsRedeemed: Math.abs(redeemAgg._sum.pointsDelta ?? 0),
        spendCents: spendAgg._sum.amountCents ?? 0,
        earnTransactions: pointsAgg._count,
        redeemTransactions: redeemAgg._count,
      },
      tierDistribution: tiersWithCounts.map((t) => ({
        rank: t.rank,
        name: t.name,
        cards: t._count.cards,
      })),
      topRewards: topRewardsRaw.map((r) => ({
        name: r.note,
        redemptions: r._count._all,
      })),
    };
  });

  app.patch("/v1/admin/tenant", async (req) => {
    const body = updateTenantBody.parse(req.body);
    return prisma.tenant.update({
      where: { id: req.staff!.tenantId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.brandColor !== undefined
          ? { brandColor: body.brandColor.startsWith("#") ? body.brandColor : `#${body.brandColor}` }
          : {}),
        ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
        ...(body.currency !== undefined ? { currency: body.currency.toUpperCase() } : {}),
      },
    });
  });

  app.get("/v1/admin/tenant", async (req) => {
    return prisma.tenant.findUniqueOrThrow({
      where: { id: req.staff!.tenantId },
    });
  });
}
