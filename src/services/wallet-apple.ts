import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PKPass } from "passkit-generator";
import type { GiftCard, LoyaltyCard, Tenant, Tier } from "@prisma/client";
import { env } from "../lib/env.js";
import { loadSecretBuffer } from "../lib/secret-loader.js";

// Generates an Apple Wallet (.pkpass) bundle for either a loyalty card or a
// gift card. The pass embeds:
//   * A `webServiceURL` so iOS phones register with our PassKit web service
//     and we can push pass updates (lock-screen notifications) later.
//   * A QR barcode encoding the card's opaque nfcSerial. NFC tap (Apple VAS)
//     is intentionally not configured here — VAS approval is a separate
//     Apple workflow and requires an encryption public key. Until that lands,
//     cards work as QR only.
//
// Apple's signing requires a Pass Type ID certificate plus the WWDR root
// chain. Both come from developer.apple.com. If the certs are not configured
// the function throws — wallet generation is intentionally a hard dependency.
//
// Brand assets (logo, icon, strip) live per tenant under
//   <repo>/assets/passes/<tenant.slug>/{logo,icon,strip}{,@2x}.png
// and are loaded once and cached in memory.

const ASSET_FILENAMES = [
  "logo.png",
  "logo@2x.png",
  "icon.png",
  "icon@2x.png",
  "strip.png",
  "strip@2x.png",
] as const;

type AssetBuffers = Record<string, Buffer>;

const assetCache = new Map<string, AssetBuffers>();

async function loadTenantAssets(slug: string): Promise<AssetBuffers> {
  const cached = assetCache.get(slug);
  if (cached) return cached;

  // Resolve relative to this source file so it works in dev (tsx, src/) and
  // in built output (dist/) the same way. Both are 3 levels deep below repo
  // root: src/services/wallet-apple.ts and dist/services/wallet-apple.js.
  const here = dirname(fileURLToPath(import.meta.url));
  const baseDir = join(here, "..", "..", "assets", "passes", slug);
  const buffers: AssetBuffers = {};
  await Promise.all(
    ASSET_FILENAMES.map(async (name) => {
      try {
        buffers[name] = await readFile(join(baseDir, name));
      } catch {
        // Optional assets (e.g. strip.png on tenants that don't use one) are
        // simply skipped. Missing logo/icon will produce an Apple validation
        // error at install-time — that's the right failure surface.
      }
    }),
  );
  assetCache.set(slug, buffers);
  return buffers;
}

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

function formatLastUpdate(d: Date): string {
  // Match Juicy's format ("HH:mm DD/MM") since that's what users expect.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export async function buildLoyaltyPass(args: {
  tenant: Tenant;
  card: LoyaltyCard;
  tier: Tier;
  customerName: string;
  publicHost: string;
}): Promise<Buffer> {
  const [certs, assets] = await Promise.all([
    loadCerts(),
    loadTenantAssets(args.tenant.slug),
  ]);

  // Layout deliberately matches the existing Chuí pass design: a strip image
  // hero (with brand wordmark + multilingual greeting baked in), Points in
  // the header, member name + last-update in secondary fields, no primary
  // fields (the strip image occupies that space). Tier is intentionally not
  // displayed on the pass — the program is points-first; tier perks (if any)
  // apply at the till but don't change how the card looks.
  const pass = new PKPass(assets, certs, {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_IDENTIFIER!,
    teamIdentifier: env.APPLE_TEAM_IDENTIFIER!,
    serialNumber: args.card.id,
    organizationName: args.tenant.name,
    description: `${args.tenant.name} Friends`,
    foregroundColor: "rgb(237,235,226)",
    backgroundColor: "rgb(16,40,26)",
    labelColor: "rgb(237,235,226)",
    webServiceURL: `${args.publicHost}/v1/wallet/apple`,
    authenticationToken: args.card.id,
  });

  pass.type = "storeCard";
  pass.headerFields.push({
    key: "points",
    label: "Points",
    value: args.card.pointsBalance,
    changeMessage: "Points updated to %@",
  });
  pass.secondaryFields.push(
    { key: "member_name", label: "Member Name", value: args.customerName },
    { key: "last_update", label: "Last Update", value: formatLastUpdate(new Date()) },
  );
  pass.backFields.push(
    {
      key: "instagram",
      label: "Instagram",
      value: "https://www.instagram.com/chui.ba/",
      attributedValue: '<a href="https://www.instagram.com/chui.ba/">@chui.ba</a>',
    },
    {
      key: "reservations",
      label: "Reservas / Book a table",
      value: "https://www.opentable.com/r/chui-buenos-aires-reservations-buenos-aires",
      attributedValue:
        '<a href="https://www.opentable.com/r/chui-buenos-aires-reservations-buenos-aires">OpenTable</a>',
    },
    {
      key: "card_id",
      label: "ID",
      value: args.card.nfcSerial,
    },
    {
      key: "terms",
      label: "Terms and Conditions",
      value:
        "Programa de fidelidad de Chuí. Los puntos se acreditan en cada visita y se pueden canjear por beneficios definidos por el restaurante. Programa sujeto a cambios.",
    },
  );

  pass.setBarcodes({ message: args.card.nfcSerial, format: "PKBarcodeFormatQR" });

  return pass.getAsBuffer();
}

export async function buildGiftPass(args: {
  tenant: Tenant;
  giftCard: GiftCard;
  publicHost: string;
}): Promise<Buffer> {
  const [certs, assets] = await Promise.all([
    loadCerts(),
    loadTenantAssets(args.tenant.slug),
  ]);

  const pass = new PKPass(assets, certs, {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_IDENTIFIER!,
    teamIdentifier: env.APPLE_TEAM_IDENTIFIER!,
    serialNumber: args.giftCard.id,
    organizationName: args.tenant.name,
    description: `${args.tenant.name} Gift Card`,
    foregroundColor: "rgb(237,235,226)",
    backgroundColor: "rgb(16,40,26)",
    labelColor: "rgb(237,235,226)",
  });

  pass.type = "storeCard";
  pass.headerFields.push({ key: "type", label: "Tipo", value: "Gift Card" });
  pass.primaryFields.push({
    key: "balance",
    label: "Saldo",
    value: dollars(args.giftCard.balance, args.tenant.currency),
  });
  pass.secondaryFields.push({ key: "code", label: "Código", value: args.giftCard.code });

  pass.setBarcodes({ message: args.giftCard.nfcSerial, format: "PKBarcodeFormatQR" });

  return pass.getAsBuffer();
}
