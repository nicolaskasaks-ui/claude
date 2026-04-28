import argon2 from "argon2";
import { prisma } from "../lib/prisma.js";
import { generateGiftCardCode, generateNfcSerial } from "../lib/ids.js";
import { BadRequest, NotFound } from "../lib/errors.js";

// Gift cards are issued purely as wallet passes (Apple Wallet / Google Wallet).
// There are no plastic cards. The recipient gets a link/QR to install the
// pass; the pass carries an opaque NFC serial that is what the till reads.
//
// Redemption is partial-allowed: a $50 card can be tapped on a $30 sale and
// keep $20. Each redemption is its own transaction so the audit trail is
// complete.

export async function issueGiftCard(input: {
  tenantId: string;
  initialAmountCents: number;
  customerId?: string;
  expiresAt?: Date;
  pin?: string;
  codePrefix?: string;
}) {
  if (input.initialAmountCents <= 0) {
    throw BadRequest("initialAmountCents must be positive");
  }
  if (input.pin && !/^\d{4,8}$/.test(input.pin)) {
    throw BadRequest("PIN must be 4 to 8 digits");
  }

  const pinHash = input.pin ? await argon2.hash(input.pin) : null;

  const giftCard = await prisma.giftCard.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      code: generateGiftCardCode(input.codePrefix),
      nfcSerial: generateNfcSerial(),
      initialAmount: input.initialAmountCents,
      balance: input.initialAmountCents,
      pinHash,
      expiresAt: input.expiresAt,
    },
  });

  await prisma.transaction.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      giftCardId: giftCard.id,
      kind: "GIFT_LOAD",
      amountCents: input.initialAmountCents,
      note: "Initial load",
    },
  });

  return giftCard;
}

export async function redeemGiftCard(input: {
  tenantId: string;
  giftCardId: string;
  amountCents: number;
  locationId?: string;
  idempotencyKey?: string;
  // Optional verification PIN. Required only if the gift card was issued
  // with a pinHash; cards without one (today: every card, since the public
  // purchase flow never sets a PIN) skip the check.
  pin?: string;
}) {
  if (input.amountCents <= 0) throw BadRequest("amountCents must be positive");

  // Serializable isolation: two terminals tapping the same card must not both
  // pass the balance check off a stale read and produce a double-spend. With
  // Postgres SERIALIZABLE one of the conflicting transactions is aborted and
  // Prisma surfaces the retry to the caller (the POS retries the tap).
  return prisma.$transaction(
    async (tx) => {
      if (input.idempotencyKey) {
        const dup = await tx.transaction.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (dup) return dup;
      }

      const card = await tx.giftCard.findUniqueOrThrow({ where: { id: input.giftCardId } });
      if (card.tenantId !== input.tenantId) throw NotFound("Gift card not in tenant");
      if (card.status !== "ACTIVE") throw BadRequest("Gift card is not active");
      if (card.expiresAt && card.expiresAt < new Date()) {
        await tx.giftCard.update({ where: { id: card.id }, data: { status: "EXPIRED" } });
        throw BadRequest("Gift card has expired");
      }
      if (card.pinHash) {
        if (!input.pin) throw BadRequest("PIN required");
        const ok = await argon2.verify(card.pinHash, input.pin);
        if (!ok) throw BadRequest("Invalid PIN");
      }
      if (card.balance < input.amountCents) {
        throw BadRequest("Insufficient gift card balance");
      }

      const newBalance = card.balance - input.amountCents;
      await tx.giftCard.update({
        where: { id: card.id },
        data: {
          balance: newBalance,
          status: newBalance === 0 ? "REDEEMED" : "ACTIVE",
        },
      });

      return tx.transaction.create({
        data: {
          tenantId: input.tenantId,
          locationId: input.locationId,
          customerId: card.customerId,
          giftCardId: card.id,
          kind: "GIFT_REDEEM",
          amountCents: input.amountCents,
          idempotencyKey: input.idempotencyKey,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}
