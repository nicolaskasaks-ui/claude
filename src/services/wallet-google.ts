import { SignJWT, importPKCS8 } from "jose";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { loadSecretString } from "../lib/secret-loader.js";
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
  const raw = await loadSecretString({
    b64: env.GOOGLE_WALLET_SA_JSON_B64,
    path: env.GOOGLE_WALLET_SERVICE_ACCOUNT_PATH,
    label: "GOOGLE_WALLET service account",
  });
  if (!raw) throw new Error("Google Wallet service account not configured");
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
    // Same identifier as the NFC payload so cashiers can scan or tap interchangeably.
    barcode: { type: "QR_CODE", value: args.giftCard.nfcSerial },
    smartTapRedemptionValue: smartTapPayload,
  };

  const jwt = await signSaveJwt({ giftCardObjects: [giftObject] });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

// ---------------------------------------------------------------------------
// Pass update push for Google Wallet.
//
// Apple uses APNs to nudge the device, which then re-fetches the pass.
// Google is the inverse: we PATCH the wallet object on Google's servers, and
// Google fans out the update + (optional) message to every installed device.
//
// We do two things per push:
//   1. PATCH the loyalty object so the points balance and tier name on the
//      pass reflect the latest DB state.
//   2. If a campaign message was supplied, addMessage so it surfaces as a
//      lock-screen notification on Android.
//
// If Google Wallet isn't configured (no Issuer ID or service account), this
// is a no-op so dev / Apple-only deploys don't break.
// ---------------------------------------------------------------------------

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const WALLET_API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1";
const WALLET_OAUTH_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const sa = await loadServiceAccount();
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: WALLET_OAUTH_SCOPE,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google OAuth token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export async function pushGooglePassUpdate(
  cardId: string,
  message?: string,
): Promise<void> {
  const hasCreds =
    !!env.GOOGLE_WALLET_SERVICE_ACCOUNT_PATH || !!env.GOOGLE_WALLET_SA_JSON_B64;
  if (!env.GOOGLE_WALLET_ISSUER_ID || !hasCreds) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log(`[google-wallet] not configured, skipping push card=${cardId}`);
    }
    return;
  }

  const card = await prisma.loyaltyCard.findUnique({
    where: { id: cardId },
    include: { tier: true, tenant: true },
  });
  if (!card) return;

  const issuerId = env.GOOGLE_WALLET_ISSUER_ID;
  const objectId = `${issuerId}.card-${card.id}`;
  const accessToken = await getAccessToken();

  // Sync points balance + tier label on the pass so subsequent fetches show
  // the latest values.
  const patchRes = await fetch(`${WALLET_API_BASE}/loyaltyObject/${objectId}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      loyaltyPoints: {
        label: "Puntos",
        balance: { int: card.pointsBalance },
      },
      secondaryLoyaltyPoints: {
        label: "Nivel",
        balance: { string: card.tier.name },
      },
    }),
  });
  if (!patchRes.ok && patchRes.status !== 404) {
    // 404 = the user never installed the pass; treat as no-op rather than fail.
    throw new Error(
      `Google Wallet PATCH failed card=${cardId} status=${patchRes.status}: ${await patchRes.text()}`,
    );
  }

  if (message) {
    const msgRes = await fetch(
      `${WALLET_API_BASE}/loyaltyObject/${objectId}/addMessage`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: {
            header: card.tenant.name,
            body: message,
            id: `msg-${Date.now()}`,
            messageType: "TEXT",
          },
        }),
      },
    );
    if (!msgRes.ok && msgRes.status !== 404) {
      throw new Error(
        `Google Wallet addMessage failed card=${cardId} status=${msgRes.status}: ${await msgRes.text()}`,
      );
    }
  }
}
