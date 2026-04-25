import { readFile } from "node:fs/promises";
import { PKPass } from "passkit-generator";
import type { GiftCard, LoyaltyCard, Tenant, Tier } from "@prisma/client";
import { env } from "../lib/env.js";
import { signNfcToken } from "../lib/nfc-token.js";

// Generates an Apple Wallet (.pkpass) bundle for either a loyalty card or a
// gift card. The pass embeds:
//   * A signed NFC token in the `nfc.message` field (Apple VAS) so the till
//     reader sees a tamper-evident payload on tap.
//   * A `webServiceURL` so iOS phones register with our PassKit web service
//     and we can push pass updates (lock-screen notifications) later.
//
// Apple's signing requires a Pass Type ID certificate plus the WWDR root
// chain. Both come from developer.apple.com. If the certs are not configured
// the function throws — wallet generation is intentionally a hard dependency.

async function loadCerts() {
  if (
    !env.APPLE_PASS_TYPE_IDENTIFIER ||
    !env.APPLE_TEAM_IDENTIFIER ||
    !env.APPLE_PASS_CERT_PATH ||
    !env.APPLE_PASS_KEY_PATH ||
    !env.APPLE_WWDR_CERT_PATH
  ) {
    throw new Error("Apple Wallet certs are not configured");
  }
  const [signerCert, signerKey, wwdr] = await Promise.all([
    readFile(env.APPLE_PASS_CERT_PATH),
    readFile(env.APPLE_PASS_KEY_PATH),
    readFile(env.APPLE_WWDR_CERT_PATH),
  ]);
  return {
    signerCert,
    signerKey,
    wwdr,
    signerKeyPassphrase: env.APPLE_PASS_KEY_PASSPHRASE || undefined,
  };
}

function dollars(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export async function buildLoyaltyPass(args: {
  tenant: Tenant;
  card: LoyaltyCard;
  tier: Tier;
  customerName: string;
  publicHost: string;
}): Promise<Buffer> {
  const certs = await loadCerts();
  const nfcMessage = await signNfcToken({
    kind: "loyalty",
    tenantId: args.tenant.id,
    serial: args.card.nfcSerial,
  });

  const pass = new PKPass({}, certs, {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_IDENTIFIER!,
    teamIdentifier: env.APPLE_TEAM_IDENTIFIER!,
    serialNumber: args.card.id,
    organizationName: args.tenant.name,
    description: `${args.tenant.name} Loyalty`,
    foregroundColor: "rgb(255,255,255)",
    backgroundColor: hexToRgb(args.tier.color),
    labelColor: "rgb(255,255,255)",
    webServiceURL: `${args.publicHost}/v1/wallet/apple`,
    authenticationToken: args.card.id, // simple per-card token; Apple requires >=16 chars
    storeCard: {
      headerFields: [{ key: "tier", label: "Nivel", value: args.tier.name }],
      primaryFields: [
        { key: "points", label: "Puntos", value: args.card.pointsBalance },
      ],
      secondaryFields: [
        { key: "name", label: "Miembro", value: args.customerName },
      ],
      auxiliaryFields: [
        { key: "discount", label: "Descuento", value: `${args.tier.discountPct}%` },
      ],
      backFields: [
        { key: "id", label: "ID", value: args.card.nfcSerial },
        { key: "terms", label: "Condiciones", value: "Programa sujeto a cambios." },
      ],
    },
  });

  pass.setBarcodes({ message: args.card.nfcSerial, format: "PKBarcodeFormatQR" });
  pass.setNFC({ message: nfcMessage, encryptionPublicKey: undefined });

  return pass.getAsBuffer();
}

export async function buildGiftPass(args: {
  tenant: Tenant;
  giftCard: GiftCard;
  publicHost: string;
}): Promise<Buffer> {
  const certs = await loadCerts();
  const nfcMessage = await signNfcToken({
    kind: "gift",
    tenantId: args.tenant.id,
    serial: args.giftCard.nfcSerial,
  });

  const pass = new PKPass({}, certs, {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_IDENTIFIER!,
    teamIdentifier: env.APPLE_TEAM_IDENTIFIER!,
    serialNumber: args.giftCard.id,
    organizationName: args.tenant.name,
    description: `${args.tenant.name} Gift Card`,
    foregroundColor: "rgb(255,255,255)",
    backgroundColor: hexToRgb(args.tenant.brandColor),
    storeCard: {
      headerFields: [{ key: "type", label: "Tipo", value: "Gift Card" }],
      primaryFields: [
        {
          key: "balance",
          label: "Saldo",
          value: dollars(args.giftCard.balance, args.tenant.currency),
        },
      ],
      secondaryFields: [
        { key: "code", label: "Código", value: args.giftCard.code },
      ],
    },
  });

  // Use the opaque nfcSerial (not the human code) so the QR encodes the same
  // identifier the till would receive over an NFC tap with VAS.
  pass.setBarcodes({ message: args.giftCard.nfcSerial, format: "PKBarcodeFormatQR" });
  pass.setNFC({ message: nfcMessage, encryptionPublicKey: undefined });

  return pass.getAsBuffer();
}

function hexToRgb(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgb(${r},${g},${b})`;
}
