import { PKPass } from "passkit-generator";
import type { GiftCard, LoyaltyCard, Tenant, Tier } from "@prisma/client";
import { env } from "../lib/env.js";
import { loadSecretBuffer } from "../lib/secret-loader.js";

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
  if (!env.APPLE_PASS_TYPE_IDENTIFIER || !env.APPLE_TEAM_IDENTIFIER) {
    throw new Error("Apple Wallet certs are not configured");
  }
  const [signerCert, signerKey, wwdr] = await Promise.all([
    loadSecretBuffer({ b64: env.APPLE_PASS_CERT_B64, path: env.APPLE_PASS_CERT_PATH, label: "APPLE_PASS_CERT" }),
    loadSecretBuffer({ b64: env.APPLE_PASS_KEY_B64, path: env.APPLE_PASS_KEY_PATH, label: "APPLE_PASS_KEY" }),
    loadSecretBuffer({ b64: env.APPLE_WWDR_CERT_B64, path: env.APPLE_WWDR_CERT_PATH, label: "APPLE_WWDR_CERT" }),
  ]);
  if (!signerCert || !signerKey || !wwdr) {
    throw new Error("Apple Wallet certs are not configured");
  }
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
  });

  // Pass type and pass-type-specific fields are set after construction in
  // passkit-generator v3 (the constructor only takes top-level pass.json).
  pass.type = "storeCard";
  pass.headerFields.push({ key: "tier", label: "Nivel", value: args.tier.name });
  pass.primaryFields.push({ key: "points", label: "Puntos", value: args.card.pointsBalance });
  pass.secondaryFields.push({ key: "name", label: "Miembro", value: args.customerName });
  pass.auxiliaryFields.push({ key: "discount", label: "Descuento", value: `${args.tier.discountPct}%` });
  pass.backFields.push(
    { key: "id", label: "ID", value: args.card.nfcSerial },
    { key: "terms", label: "Condiciones", value: "Programa sujeto a cambios." },
  );

  pass.setBarcodes({ message: args.card.nfcSerial, format: "PKBarcodeFormatQR" });
  // NFC tap (Apple VAS) is intentionally not configured here. VAS approval
  // is a separate Apple workflow and requires an encryption public key. Until
  // that lands, cards work as QR only — re-enable setNFC once we have the
  // VAS Merchant Public Key and feed it via env.

  return pass.getAsBuffer();
}

export async function buildGiftPass(args: {
  tenant: Tenant;
  giftCard: GiftCard;
  publicHost: string;
}): Promise<Buffer> {
  const certs = await loadCerts();

  const pass = new PKPass({}, certs, {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_IDENTIFIER!,
    teamIdentifier: env.APPLE_TEAM_IDENTIFIER!,
    serialNumber: args.giftCard.id,
    organizationName: args.tenant.name,
    description: `${args.tenant.name} Gift Card`,
    foregroundColor: "rgb(255,255,255)",
    backgroundColor: hexToRgb(args.tenant.brandColor),
  });

  pass.type = "storeCard";
  pass.headerFields.push({ key: "type", label: "Tipo", value: "Gift Card" });
  pass.primaryFields.push({
    key: "balance",
    label: "Saldo",
    value: dollars(args.giftCard.balance, args.tenant.currency),
  });
  pass.secondaryFields.push({ key: "code", label: "Código", value: args.giftCard.code });

  // Use the opaque nfcSerial (not the human code) so the QR encodes the same
  // identifier the till would receive over a future NFC tap with VAS.
  pass.setBarcodes({ message: args.giftCard.nfcSerial, format: "PKBarcodeFormatQR" });
  // setNFC is intentionally omitted — see buildLoyaltyPass for context.

  return pass.getAsBuffer();
}

function hexToRgb(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgb(${r},${g},${b})`;
}
