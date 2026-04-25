import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

// Seed data for Chui — the launch tenant. Defines a Silver/Gold/Platinum
// ladder modeled after airline programs:
//
//   Silver   ($0+)        : entry tier, 1x points, no automatic discount
//   Gold     ($500+/year) : 1.25x points, 5% off
//   Platinum ($2000+/year): 1.5x points, 10% off
//
// Reward catalog includes a free entree, a free dessert, and a tasting menu
// upgrade reserved for Platinum.

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "chui" },
    update: {},
    create: {
      slug: "chui",
      name: "Chui",
      brandColor: "#0F1B2D",
      currency: "USD",
      tierPeriodDays: 365,
    },
  });

  const ownerEmail = "owner@chui.com";
  const ownerExists = await prisma.staffUser.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: ownerEmail } },
  });
  if (!ownerExists) {
    await prisma.staffUser.create({
      data: {
        tenantId: tenant.id,
        email: ownerEmail,
        name: "Chui Owner",
        role: "OWNER",
        passwordHash: await argon2.hash("chui-change-me-please"),
      },
    });
  }

  await prisma.location.upsert({
    where: { id: `${tenant.id}-main` },
    update: {},
    create: { id: `${tenant.id}-main`, tenantId: tenant.id, name: "Chui Main" },
  });

  const tiers = [
    {
      name: "Silver",
      rank: 1,
      qualifyPoints: 0,
      qualifySpend: 0,
      discountPct: 0,
      pointsMultiplier: 1.0,
      color: "#C0C0C0",
    },
    {
      name: "Gold",
      rank: 2,
      qualifyPoints: 500,
      qualifySpend: 50_000, // $500 in cents
      discountPct: 5,
      pointsMultiplier: 1.25,
      color: "#D4AF37",
    },
    {
      name: "Platinum",
      rank: 3,
      qualifyPoints: 2_000,
      qualifySpend: 200_000, // $2000 in cents
      discountPct: 10,
      pointsMultiplier: 1.5,
      color: "#1F3B5C",
    },
  ];
  for (const t of tiers) {
    await prisma.tier.upsert({
      where: { tenantId_rank: { tenantId: tenant.id, rank: t.rank } },
      update: t,
      create: { ...t, tenantId: tenant.id },
    });
  }

  const rewards = [
    { name: "Postre de cortesía", description: "Cualquier postre del menú", pointsCost: 200, minTierRank: 1 },
    { name: "Plato principal gratis", description: "Hasta $25 en un entrée", pointsCost: 800, minTierRank: 2 },
    { name: "Menú degustación", description: "Para el titular y un acompañante", pointsCost: 3000, minTierRank: 3 },
  ];
  for (const r of rewards) {
    const exists = await prisma.reward.findFirst({
      where: { tenantId: tenant.id, name: r.name },
    });
    if (!exists) {
      await prisma.reward.create({ data: { ...r, tenantId: tenant.id } });
    }
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete. Tenant:", tenant.slug, " Owner:", ownerEmail, "/ chui-change-me-please");
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
