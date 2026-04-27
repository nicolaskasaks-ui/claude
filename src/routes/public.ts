import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { issueCard } from "../services/loyalty.js";
import { issueGiftCard } from "../services/gift-cards.js";
import {
  createGiftCardPreference,
  fetchPayment,
  isMercadoPagoConfigured,
  verifyWebhookSignature,
} from "../services/mercado-pago.js";
import { sendGiftCardEmail, sendGiftCardReceiptEmail } from "../services/email.js";
import { BadRequest, NotFound } from "../lib/errors.js";
import { env } from "../lib/env.js";
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
  // ISO date (YYYY-MM-DD). Optional. We use it to send a birthday push and
  // unlock the relevant tier perk (postre / botella) the week of the cumple.
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)")
    .optional(),
  // Code the customer was invited with. Validated lazily later — we don't
  // reject the enroll here because a typo shouldn't block onboarding.
  referredByCode: z.string().min(3).max(20).optional(),
}).refine((d) => d.email || d.phone, {
  message: "email or phone is required",
});

// Public gift card purchase — validation guards. Amounts are in minor
// units (cents). We cap at $5M ARS = 500.000.000 cents to avoid garbage
// inputs; legitimate purchases above that go through staff issuance.
const giftPurchaseBody = z.object({
  tenantSlug: z.string().min(1),
  amountCents: z.number().int().min(500_000).max(500_000_000),
  senderName: z.string().min(1).max(80),
  senderEmail: z.string().email(),
  recipientName: z.string().min(1).max(80),
  recipientEmail: z.string().email(),
  recipientWhatsapp: z.string().min(5).max(20).optional(),
  message: z.string().max(280).optional(),
  hideAmount: z.boolean().optional(),
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
      // Backfill birthDate / referredByCode if the customer enrolled before
      // those fields were collected, but never overwrite a value that was
      // already on file (defends against an existing customer accidentally
      // changing their data via re-enrollment).
      const updates: { birthDate?: Date; referredByCode?: string } = {};
      if (body.birthDate && !existing.birthDate) {
        updates.birthDate = new Date(body.birthDate);
      }
      if (body.referredByCode && !existing.referredByCode) {
        updates.referredByCode = body.referredByCode;
      }
      if (Object.keys(updates).length > 0) {
        await prisma.customer.update({ where: { id: existing.id }, data: updates });
      }
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
          birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
          referredByCode: body.referredByCode,
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

  // ----- Public gift card purchase (Sprint 1 of Commerce module) -----

  // Buyer fills out the /regalo form. We persist their intent, create an
  // MP Preference, and return the redirect URL. The actual GiftCard is
  // not minted yet — that happens when the MP webhook confirms payment.
  app.post("/v1/public/gift-cards/purchase", async (req, reply) => {
    if (!isMercadoPagoConfigured()) {
      throw BadRequest("Mercado Pago no está configurado todavía");
    }
    const body = giftPurchaseBody.parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { slug: body.tenantSlug } });
    if (!tenant) throw NotFound("Tenant not found");

    // If the buyer is already enrolled (lookup by email), link the purchase
    // so we can later credit qualifying spend toward their tier.
    let buyerCustomerId: string | null = null;
    if (body.senderEmail) {
      const buyer = await prisma.customer.findFirst({
        where: { tenantId: tenant.id, email: body.senderEmail },
      });
      buyerCustomerId = buyer?.id ?? null;
    }

    // Persist the intent first so we have a stable id for the MP external
    // reference. We use a placeholder mpPreferenceId we'll update right
    // after the create call returns.
    const purchase = await prisma.giftCardPurchase.create({
      data: {
        tenantId: tenant.id,
        amountCents: body.amountCents,
        senderName: body.senderName,
        senderEmail: body.senderEmail,
        recipientName: body.recipientName,
        recipientEmail: body.recipientEmail,
        recipientWhatsapp: body.recipientWhatsapp,
        message: body.message,
        hideAmount: body.hideAmount ?? false,
        buyerCustomerId,
        mpPreferenceId: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: "PENDING",
      },
    });

    const baseUrl = env.PUBLIC_BASE_URL;
    const pref = await createGiftCardPreference({
      purchase,
      currency: tenant.currency,
      tenantName: tenant.name,
      baseUrl,
    });

    await prisma.giftCardPurchase.update({
      where: { id: purchase.id },
      data: { mpPreferenceId: pref.preferenceId },
    });

    return reply.send({
      purchaseId: purchase.id,
      initPoint: pref.initPoint,
      sandboxInitPoint: pref.sandboxInitPoint,
    });
  });

  // Mercado Pago notification endpoint. Called every time a payment for one
  // of our preferences transitions state. We verify the signature, look up
  // the payment, and if it's approved we mint the gift card and send the
  // emails. Idempotent: re-receiving the same payment id is a no-op.
  app.post("/v1/public/mp/webhook", async (req, reply) => {
    const sig = req.headers["x-signature"];
    const reqId = req.headers["x-request-id"];
    const query = req.query as { type?: string; "data.id"?: string; id?: string };
    const dataId = query["data.id"] || query.id;

    const verification = verifyWebhookSignature({
      signatureHeader: typeof sig === "string" ? sig : undefined,
      requestIdHeader: typeof reqId === "string" ? reqId : undefined,
      dataId,
    });
    if (!verification.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[mp:webhook] rejected: ${verification.reason}`);
      return reply.code(401).send({ error: "invalid signature" });
    }

    // We only care about payment notifications — MP also sends merchant
    // order events that we ignore.
    if (query.type && query.type !== "payment") {
      return reply.code(200).send({ skipped: true });
    }
    if (!dataId) return reply.code(400).send({ error: "missing data.id" });

    const payment = await fetchPayment(dataId);
    if (!payment.externalReference) {
      return reply.code(200).send({ skipped: "no external reference" });
    }

    const purchase = await prisma.giftCardPurchase.findUnique({
      where: { id: payment.externalReference },
      include: { tenant: true, buyerCustomer: true, giftCard: true },
    });
    if (!purchase) return reply.code(404).send({ error: "purchase not found" });

    // Idempotency: already issued — done.
    if (purchase.status === "PAID" && purchase.giftCardId) {
      return reply.code(200).send({ alreadyProcessed: true });
    }

    // Defense in depth: verify the payment amount matches the purchase
    // amount (in case someone tampered with the MP checkout).
    if (Math.abs(payment.amountCents - purchase.amountCents) > 1) {
      // eslint-disable-next-line no-console
      console.warn(
        `[mp:webhook] amount mismatch purchase=${purchase.id} expected=${purchase.amountCents} got=${payment.amountCents}`,
      );
      await prisma.giftCardPurchase.update({
        where: { id: purchase.id },
        data: { status: "FAILED", mpPaymentId: String(payment.id) },
      });
      return reply.code(409).send({ error: "amount mismatch" });
    }

    // Only "approved" should mint a gift card. Other statuses (rejected,
    // cancelled, in_process, refunded) just update bookkeeping and stop.
    if (payment.status !== "approved") {
      await prisma.giftCardPurchase.update({
        where: { id: purchase.id },
        data: {
          status: payment.status === "refunded" ? "REFUNDED" : "FAILED",
          mpPaymentId: String(payment.id),
        },
      });
      return reply.code(200).send({ status: payment.status });
    }

    // All clear — mint the gift card.
    const giftCard = await issueGiftCard({
      tenantId: purchase.tenantId,
      initialAmountCents: purchase.amountCents,
      customerId: purchase.buyerCustomerId ?? undefined,
    });

    await prisma.giftCardPurchase.update({
      where: { id: purchase.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        mpPaymentId: String(payment.id),
        giftCardId: giftCard.id,
      },
    });

    // Best-effort emails. Failures here don't roll back the gift card —
    // staff can manually resend from admin if Resend is down.
    const baseUrl = env.PUBLIC_BASE_URL;
    const amountFormatted = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: purchase.tenant.currency,
    }).format(purchase.amountCents / 100);
    try {
      await sendGiftCardEmail({
        recipientName: purchase.recipientName,
        recipientEmail: purchase.recipientEmail,
        senderName: purchase.senderName,
        message: purchase.message,
        amountFormatted,
        appleWalletUrl: `${baseUrl}/v1/wallet/gift/${giftCard.id}/apple`,
        googleWalletUrl: `${baseUrl}/v1/wallet/gift/${giftCard.id}/google`,
        tenantName: purchase.tenant.name,
      });
      await sendGiftCardReceiptEmail({
        buyerName: purchase.senderName,
        buyerEmail: purchase.senderEmail,
        recipientName: purchase.recipientName,
        amountFormatted,
        tenantName: purchase.tenant.name,
      });
      await prisma.giftCardPurchase.update({
        where: { id: purchase.id },
        data: { emailSentAt: new Date() },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[mp:webhook] email send failed for purchase=${purchase.id}`, err);
    }

    return reply.code(200).send({ ok: true, giftCardId: giftCard.id });
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
