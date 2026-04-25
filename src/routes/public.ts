import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { issueCard } from "../services/loyalty.js";
import { BadRequest, NotFound } from "../lib/errors.js";
import { requireStaff } from "../middleware/auth.js";

// Public, unauthenticated endpoints used by the customer-facing enrollment
// page. The page is typically reached by scanning a QR code at the table.
//
// We accept enrollment without a password — the wallet pass itself is the
// credential. The customer presents it (NFC tap or QR scan) to interact with
// the program; there is no separate login. This mirrors how airline status
// cards work: possession of the pass + a serial is enough.

const enrollBody = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
}).refine((d) => d.email || d.phone, {
  message: "email or phone is required",
});

export async function publicRoutes(app: FastifyInstance) {
  app.get("/v1/public/tenants/:slug", async (req) => {
    const { slug } = req.params as { slug: string };
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: {
        slug: true,
        name: true,
        brandColor: true,
        logoUrl: true,
        currency: true,
      },
    });
    if (!tenant) throw NotFound("Tenant not found");
    return tenant;
  });

  app.post("/v1/public/enroll", async (req, reply) => {
    const body = enrollBody.parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { slug: body.tenantSlug } });
    if (!tenant) throw NotFound("Tenant not found");

    // Re-use an existing customer if email/phone matches so a second scan
    // does not create duplicates and immediately returns their card link.
    const existing = await prisma.customer.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [
          body.email ? { email: body.email } : {},
          body.phone ? { phone: body.phone } : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
      include: { cards: { where: { status: "ACTIVE" } } },
    });

    let customerId: string;
    if (existing) {
      customerId = existing.id;
      if (existing.cards.length > 0) {
        const card = existing.cards[0]!;
        return reply.send({
          customerId,
          cardId: card.id,
          appleWalletUrl: `/v1/wallet/loyalty/${card.id}/apple`,
          googleWalletUrl: `/v1/wallet/loyalty/${card.id}/google`,
          alreadyEnrolled: true,
        });
      }
    } else {
      const customer = await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          email: body.email,
          phone: body.phone,
          firstName: body.firstName,
          lastName: body.lastName,
        },
      });
      customerId = customer.id;
    }

    const card = await issueCard({ tenantId: tenant.id, customerId });

    return reply.send({
      customerId,
      cardId: card.id,
      appleWalletUrl: `/v1/wallet/loyalty/${card.id}/apple`,
      googleWalletUrl: `/v1/wallet/loyalty/${card.id}/google`,
      alreadyEnrolled: false,
    });
  });

  // Public lookup of a tenant's tiers, for showing the customer what they
  // can earn. Useful on the enrollment landing page.
  app.get("/v1/public/tenants/:slug/tiers", async (req) => {
    const { slug } = req.params as { slug: string };
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw NotFound("Tenant not found");
    return prisma.tier.findMany({
      where: { tenantId: tenant.id },
      orderBy: { rank: "asc" },
      select: {
        name: true,
        rank: true,
        qualifySpend: true,
        qualifyPoints: true,
        discountPct: true,
        pointsMultiplier: true,
        color: true,
      },
    });
  });
}

// Helper used by the cashier UI: look up a customer by phone or email so the
// cashier can find a card without an NFC reader (manual entry path), or
// resolve a scanned QR code to the underlying card / gift card.
export async function customerLookupRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireStaff);

  app.get("/v1/lookup/customer", async (req) => {
    const q = req.query as { q?: string };
    if (!q.q) throw BadRequest("q is required");
    return prisma.customer.findMany({
      where: {
        tenantId: req.staff!.tenantId,
        OR: [
          { email: { contains: q.q, mode: "insensitive" } },
          { phone: { contains: q.q } },
          { firstName: { contains: q.q, mode: "insensitive" } },
          { lastName: { contains: q.q, mode: "insensitive" } },
        ],
      },
      include: { cards: { include: { tier: true } } },
      take: 10,
    });
  });

  // Resolves whatever was scanned off a wallet pass barcode. The QR encodes
  // the opaque NFC serial, which uniquely identifies either a loyalty card
  // or a gift card within the tenant. Returns enough data for the POS to
  // route the cashier to the correct flow (earn vs. redeem).
  app.get("/v1/lookup/by-serial", async (req) => {
    const q = req.query as { serial?: string };
    if (!q.serial) throw BadRequest("serial is required");
    const tenantId = req.staff!.tenantId;

    const card = await prisma.loyaltyCard.findUnique({
      where: { nfcSerial: q.serial },
      include: { tier: true, customer: true },
    });
    if (card && card.tenantId === tenantId) {
      return { kind: "loyalty" as const, card };
    }

    const gift = await prisma.giftCard.findUnique({
      where: { nfcSerial: q.serial },
    });
    if (gift && gift.tenantId === tenantId) {
      return { kind: "gift" as const, giftCard: gift };
    }

    // Some QR codes may carry the human-readable gift code (e.g. printed
    // receipts). Fall back to that lookup so the cashier flow works either way.
    const giftByCode = await prisma.giftCard.findUnique({
      where: { code: q.serial },
    });
    if (giftByCode && giftByCode.tenantId === tenantId) {
      return { kind: "gift" as const, giftCard: giftByCode };
    }

    throw NotFound("Pass not found in this tenant");
  });
}
