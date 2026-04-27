import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

// Seed data for Chui — the launch tenant. Three-level membership program.
// Tier names use the airline-style Silver / Gold / Platinum convention so
// the customer-facing copy stays universally readable. The richer perks
// (lunch window, happy hour, wine upgrade, etc.) live in the JSON below.
//
//   Silver    (entry, automatic on enrollment)
//   Gold      ($300.000 ARS or 1.000 pts in 12 months)
//   Platinum  ($1.200.000 ARS or 4.000 pts in 12 months, or invite)
//
// `discountPct` is intentionally 0 for all tiers: the new model uses the
// `perks` JSON which the POS evaluates contextually (lunch window, dinner
// days, happy hour) rather than applying a blanket discount.

const prisma = new PrismaClient();

// Perks shape — see comment in schema.prisma "Tier.perks" for all fields.
// Numeric discounts are percent off (0..100).
const SILVER_PERKS = {
  lunch_discount: 10,
  lunch_window: "12:00-15:00",
  lunch_days: [1, 2, 3, 4, 5],
  dinner_discount: 0,
  dinner_window: null,
  dinner_days: [],
  happy_hour_2x1: false,
  happy_hour_window: null,
  wine_upgrade_per_month: 0,
  free_dessert: "birthday",
  welcome_drink: true,
  presale_window_hours: 0,
  presale_reserved_slot: false,
  merch_discount: 0,
  birthday_bottle_sku: null,
  birthday_dessert: true,
  chef_table_per_year: 0,
  private_party_invites: false,
  waitlist_priority: false,
  newsletter: true,
};

const GOLD_PERKS = {
  lunch_discount: 15,
  lunch_window: "12:00-15:00",
  lunch_days: [1, 2, 3, 4, 5],
  dinner_discount: 0,
  dinner_window: null,
  dinner_days: [],
  happy_hour_2x1: true,
  happy_hour_window: "19:00-20:00",
  happy_hour_days: [1, 2, 3, 4],
  wine_upgrade_per_month: 1,
  free_dessert: "birthday",
  welcome_drink: true,
  presale_window_hours: 48,
  presale_reserved_slot: false,
  merch_discount: 20,
  birthday_bottle_sku: "house-bottle",
  birthday_dessert: false,
  chef_table_per_year: 0,
  private_party_invites: false,
  waitlist_priority: false,
  newsletter: true,
};

const PLATINUM_PERKS = {
  lunch_discount: 20,
  lunch_window: "12:00-15:00",
  lunch_days: [1, 2, 3, 4, 5],
  dinner_discount: 10,
  dinner_window: "19:00-23:30",
  dinner_days: [1, 2, 3, 4],
  happy_hour_2x1: true,
  happy_hour_window: "19:00-20:00",
  happy_hour_days: [1, 2, 3, 4],
  wine_upgrade_per_month: 1,
  free_dessert: "always",
  welcome_drink: true,
  presale_window_hours: 168, // 7 days
  presale_reserved_slot: true,
  merch_discount: 25,
  birthday_bottle_sku: "premium-bottle",
  birthday_dessert: false,
  chef_table_per_year: 1,
  private_party_invites: true,
  waitlist_priority: true,
  newsletter: true,
};

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "chui" },
    update: {
      name: "Chuí",
      brandColor: "#10281A",
      currency: "ARS",
    },
    create: {
      slug: "chui",
      name: "Chuí",
      brandColor: "#10281A", // rgb(16,40,26) — same green as the wallet pass
      currency: "ARS",
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
        name: "Chuí Owner",
        role: "OWNER",
        passwordHash: await argon2.hash("chui-change-me-please"),
      },
    });
  }

  await prisma.location.upsert({
    where: { id: `${tenant.id}-main` },
    update: {},
    create: { id: `${tenant.id}-main`, tenantId: tenant.id, name: "Chuí Buenos Aires" },
  });

  // Tier identities. We upsert by (tenantId, rank) so existing cards keep
  // their tier relation through a rename.
  const tiers = [
    {
      name: "Silver",
      rank: 1,
      qualifyPoints: 0,
      qualifySpend: 0,
      discountPct: 0,
      pointsMultiplier: 1.0,
      color: "#10281A",
      description: "Bienvenido al programa de Chuí. Beneficios desde tu primera visita.",
      stripImage: "silver",
      perks: SILVER_PERKS,
    },
    {
      name: "Gold",
      rank: 2,
      qualifyPoints: 1_000,
      qualifySpend: 30_000_000, // $300.000 ARS expressed in cents
      discountPct: 0,
      pointsMultiplier: 1.25,
      color: "#10281A",
      description: "Acceso anticipado a eventos y beneficios del programa.",
      stripImage: "gold",
      perks: GOLD_PERKS,
    },
    {
      name: "Platinum",
      rank: 3,
      qualifyPoints: 4_000,
      qualifySpend: 120_000_000, // $1.200.000 ARS expressed in cents
      discountPct: 0,
      pointsMultiplier: 1.5,
      color: "#10281A",
      description: "Mesa del Chef, fiestas privadas, prioridad en lista de espera.",
      stripImage: "platinum",
      perks: PLATINUM_PERKS,
    },
  ];
  for (const t of tiers) {
    await prisma.tier.upsert({
      where: { tenantId_rank: { tenantId: tenant.id, rank: t.rank } },
      update: t,
      create: { ...t, tenantId: tenant.id },
    });
  }

  // Reward catalog. Restated for the new program. Existing rewards are left
  // in place (we don't delete) because they may have history; we just stop
  // creating placeholders that don't match the brand.
  const rewards = [
    {
      name: "Postre cortesía",
      description: "Cualquier postre del menú",
      pointsCost: 200,
      minTierRank: 1,
      kind: "POINTS_REDEMPTION" as const,
    },
    {
      name: "Copa de vino premium",
      description: "Upgrade a copa premium en tu próxima visita",
      pointsCost: 500,
      minTierRank: 2,
      kind: "POINTS_REDEMPTION" as const,
    },
    {
      name: "Botella de la casa",
      description: "Botella seleccionada por el sommelier para tu mesa",
      pointsCost: 1500,
      minTierRank: 2,
      kind: "POINTS_REDEMPTION" as const,
    },
    {
      name: "Mesa del Chef",
      description: "Cena privada multi-tiempos para dos. Por invitación.",
      pointsCost: 0,
      minTierRank: 3,
      kind: "EVENT_INVITE" as const,
    },
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
  console.log("Seed complete. Tenant:", tenant.slug, "Owner:", ownerEmail, "/ chui-change-me-please");
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
