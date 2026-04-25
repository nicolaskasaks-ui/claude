import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireTerminal } from "../middleware/auth.js";
import { verifyNfcToken } from "../lib/nfc-token.js";
import { BadRequest, NotFound } from "../lib/errors.js";
import { accrueFromSale } from "../services/loyalty.js";
import { redeemGiftCard } from "../services/gift-cards.js";

// This is the endpoint a register / NFC reader hits when a phone is tapped.
// The terminal sends:
//   * the signed NFC token it read off the wallet pass (Apple VAS / Google
//     Smart Tap), which proves the card is genuine and identifies tenant +
//     serial without us trusting the terminal,
//   * the sale total in cents, and
//   * an idempotency key so a retry from a flaky reader does not double-bill.
//
// The endpoint dispatches based on the token's `kind`: loyalty cards earn
// points + maybe apply a tier discount, gift cards debit balance.

const tapBody = z.object({
  nfcToken: z.string(),
  saleTotalCents: z.number().int().positive(),
  idempotencyKey: z.string().min(8),
});

export async function terminalRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireTerminal);

  app.post("/v1/terminal/tap", async (req) => {
    const body = tapBody.parse(req.body);
    const tenantId = req.terminal!.tenantId;

    let payload;
    try {
      payload = await verifyNfcToken(body.nfcToken);
    } catch {
      throw BadRequest("Invalid NFC token");
    }
    if (payload.tenantId !== tenantId) throw BadRequest("Token belongs to a different tenant");

    const terminal = await prisma.terminal.findUniqueOrThrow({
      where: { id: req.terminal!.id },
    });

    if (payload.kind === "loyalty") {
      const card = await prisma.loyaltyCard.findUnique({
        where: { nfcSerial: payload.serial },
        include: { tier: true, customer: true },
      });
      if (!card || card.tenantId !== tenantId) throw NotFound("Card not found");
      if (card.status !== "ACTIVE") throw BadRequest("Card is not active");

      const tierDiscountCents =
        Math.floor((body.saleTotalCents * card.tier.discountPct) / 100);
      const chargeable = body.saleTotalCents - tierDiscountCents;

      const earnTx = await accrueFromSale({
        tenantId,
        cardId: card.id,
        amountCents: chargeable,
        locationId: terminal.locationId ?? undefined,
        idempotencyKey: body.idempotencyKey,
      });

      return {
        kind: "loyalty",
        card: {
          id: card.id,
          tier: card.tier.name,
          tierRank: card.tier.rank,
          discountPct: card.tier.discountPct,
          customer: {
            firstName: card.customer.firstName,
            lastName: card.customer.lastName,
          },
        },
        sale: {
          subtotalCents: body.saleTotalCents,
          tierDiscountCents,
          chargeableCents: chargeable,
          pointsEarned: earnTx.pointsDelta,
        },
      };
    }

    if (payload.kind === "gift") {
      const giftCard = await prisma.giftCard.findUnique({
        where: { nfcSerial: payload.serial },
      });
      if (!giftCard || giftCard.tenantId !== tenantId) throw NotFound("Gift card not found");

      // Take whatever is needed up to the available balance; the till handles
      // the rest with another payment method.
      const debit = Math.min(giftCard.balance, body.saleTotalCents);
      const tx = await redeemGiftCard({
        tenantId,
        giftCardId: giftCard.id,
        amountCents: debit,
        locationId: terminal.locationId ?? undefined,
        idempotencyKey: body.idempotencyKey,
      });
      const refreshed = await prisma.giftCard.findUniqueOrThrow({ where: { id: giftCard.id } });

      return {
        kind: "gift",
        giftCard: {
          id: giftCard.id,
          code: giftCard.code,
          remainingBalanceCents: refreshed.balance,
        },
        sale: {
          totalCents: body.saleTotalCents,
          chargedToGiftCardCents: debit,
          remainingDueCents: body.saleTotalCents - debit,
          transactionId: tx.id,
        },
      };
    }

    throw BadRequest("Unknown NFC token kind");
  });
}
