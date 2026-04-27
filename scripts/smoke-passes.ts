import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma.js";
import { buildLoyaltyPass, buildGiftPass } from "../src/services/wallet-apple.js";
import { generateNfcSerial } from "../src/lib/ids.js";

// Generates a sample .pkpass per tier (and one gift card pass) using the
// local Postgres seed data. The output goes to /tmp so it's easy to drag
// onto the simulator or AirDrop to a phone for visual review.

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "chui" } });
  const tiers = await prisma.tier.findMany({
    where: { tenantId: tenant.id },
    orderBy: { rank: "asc" },
  });

  // Use a single fictitious customer and synthesize cards for each tier so
  // we exercise the per-tier render path without persisting noise.
  const fakeCustomer = {
    id: "smoketest-customer",
    firstName: "Nico",
    lastName: "Kasakoff",
  };

  for (const tier of tiers) {
    const fakeCard = {
      id: `smoketest-${tier.name}-pad-${"x".repeat(16)}`.slice(0, 32),
      tenantId: tenant.id,
      customerId: fakeCustomer.id,
      tierId: tier.id,
      nfcSerial: generateNfcSerial(),
      status: "ACTIVE" as const,
      pointsBalance: tier.rank * 137,
      periodPoints: Math.floor(tier.qualifyPoints * 0.65),
      periodSpend: Math.floor(tier.qualifySpend * 0.65),
      periodStartedAt: new Date(),
      issuedAt: new Date(),
      updatedAt: new Date(),
    };

    const buf = await buildLoyaltyPass({
      tenant,
      card: fakeCard,
      tier,
      customerName: `${fakeCustomer.firstName} ${fakeCustomer.lastName}`,
      publicHost: "https://card.chui.com.ar",
    });
    const out = `/tmp/chui-${tier.name.replace(/\s+/g, "-").toLowerCase()}.pkpass`;
    await writeFile(out, buf);
    console.log(`  wrote ${out} (${(buf.length / 1024).toFixed(1)}kb)`);
  }

  // Gift card sample
  const fakeGift = {
    id: "smoketest-gift",
    tenantId: tenant.id,
    customerId: null,
    code: "DEMO1234",
    nfcSerial: generateNfcSerial(),
    pinHash: null,
    initialAmount: 5_000_000, // $50.000 ARS
    balance: 5_000_000,
    status: "ACTIVE" as const,
    expiresAt: null,
    issuedAt: new Date(),
    updatedAt: new Date(),
  };
  const giftBuf = await buildGiftPass({
    tenant,
    giftCard: fakeGift,
    senderName: "Nico",
    recipientName: "Maru",
    message: "Para tu cumple. Que lo disfrutes.",
    publicHost: "https://card.chui.com.ar",
  });
  await writeFile("/tmp/chui-gift.pkpass", giftBuf);
  console.log(`  wrote /tmp/chui-gift.pkpass (${(giftBuf.length / 1024).toFixed(1)}kb)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
