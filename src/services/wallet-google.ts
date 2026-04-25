import { readFile } from "node:fs/promises";
import { SignJWT, importPKCS8 } from "jose";
import { env } from "../lib/env.js";
import type { GiftCard, LoyaltyCard, Tenant, Tier } from "@prisma/client";
import { signNfcToken } from "./../lib/nfc-token.js";

// Google Wallet uses a different shape than Apple: instead of building a
// signed bundle, we register a "class" once (the template) and then create
// "objects" (one per card). The user installs the pass by clicking a
// "Save to Google Pay" link whose JWT we generate here.
//
// We expose helpers for both the loyalty and gift card flows. Smart Tap
// (Google's NFC equivalent of Apple VAS) requires registering a Smart Tap key
// in the Google Wallet console; until that is done the pass still installs
// fine and works as a QR code.

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

async function loadServiceAccount(): Promise<ServiceAccount> {
  if (!env.GOOGLE_WALLET_SERVICE_ACCOUNT_PATH) {
    throw new Error("Google Wallet service account not configured");
  }
  const raw = await readFile(env.GOOGLE_WALLET_SERVICE_ACCOUNT_PATH, "utf8");
  return JSON.parse(raw) as ServiceAccount;
}

const SAVE_AUDIENCE = "google";
const SAVE_TYPE = "savetowallet";

async function signSaveJwt(payload: Record<string, unknown>): Promise<string> {
  const sa = await loadServiceAccount();
  const key = await importPKCS8(sa.private_key, "RS256");
  return new SignJWT({
    iss: sa.client_email,
    aud: SAVE_AUDIENCE,
    typ: SAVE_TYPE,
    payload,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt()
    .sign(key);
}

export async function buildLoyaltySaveLink(args: {
  tenant: Tenant;
  card: LoyaltyCard;
  tier: Tier;
  customerName: string;
}): Promise<string> {
  if (!env.GOOGLE_WALLET_ISSUER_ID) {
    throw new Error("GOOGLE_WALLET_ISSUER_ID not configured");
  }
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID;
  const classId = `${issuerId}.${args.tenant.slug}-loyalty`;
  const objectId = `${issuerId}.card-${args.card.id}`;

  const smartTapPayload = await signNfcToken({
    kind: "loyalty",
    tenantId: args.tenant.id,
    serial: args.card.nfcSerial,
  });

  const loyaltyObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountId: args.card.id,
    accountName: args.customerName,
    barcode: { type: "QR_CODE", value: args.card.nfcSerial },
    loyaltyPoints: {
      label: "Puntos",
      balance: { int: args.card.pointsBalance },
    },
    secondaryLoyaltyPoints: {
      label: "Nivel",
      balance: { string: args.tier.name },
    },
    smartTapRedemptionValue: smartTapPayload,
    hasUsers: false,
  };

  const jwt = await signSaveJwt({ loyaltyObjects: [loyaltyObject] });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

export async function buildGiftSaveLink(args: {
  tenant: Tenant;
  giftCard: GiftCard;
}): Promise<string> {
  if (!env.GOOGLE_WALLET_ISSUER_ID) {
    throw new Error("GOOGLE_WALLET_ISSUER_ID not configured");
  }
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID;
  const classId = `${issuerId}.${args.tenant.slug}-gift`;
  const objectId = `${issuerId}.gift-${args.giftCard.id}`;

  const smartTapPayload = await signNfcToken({
    kind: "gift",
    tenantId: args.tenant.id,
    serial: args.giftCard.nfcSerial,
  });

  const giftObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    cardNumber: args.giftCard.code,
    balance: {
      micros: BigInt(args.giftCard.balance) * 10000n,
      currencyCode: args.tenant.currency,
    },
    barcode: { type: "QR_CODE", value: args.giftCard.code },
    smartTapRedemptionValue: smartTapPayload,
  };

  const jwt = await signSaveJwt({ giftCardObjects: [giftObject] });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
