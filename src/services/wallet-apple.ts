import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PKPass } from "passkit-generator";
import type { GiftCard, LoyaltyCard, Tenant, Tier } from "@prisma/client";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
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

// Pass-level assets (logo + icon). Strip is loaded separately because we
// override it per-tier and per-pass-kind (loyalty vs gift card).
const PASS_ASSETS = ["logo.png", "logo@2x.png", "icon.png", "icon@2x.png"] as const;
const STRIP_FILENAMES = ["strip.png", "strip@2x.png", "strip@3x.png"] as const;

type AssetBuffers = Record<string, Buffer>;

const assetCache = new Map<string, AssetBuffers>();
const stripCache = new Map<string, AssetBuffers>();

function passesDir(slug: string): string {
  // Resolve relative to this source file so it works in dev (tsx, src/) and
  // in built output (dist/) the same way. Both are 3 levels deep below repo
  // root: src/services/wallet-apple.ts and dist/services/wallet-apple.js.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "assets", "passes", slug);
}

async function loadFromDir(dir: string, names: readonly string[]): Promise<AssetBuffers> {
  const buffers: AssetBuffers = {};
  await Promise.all(
    names.map(async (name) => {
      try {
        buffers[name] = await readFile(join(dir, name));
      } catch {
        // Missing optional assets are skipped silently. Required logo/icon
        // missing will surface as an Apple validation error at install time.
      }
    }),
  );
  return buffers;
}

async function loadPassAssets(slug: string): Promise<AssetBuffers> {
  const cached = assetCache.get(slug);
  if (cached) return cached;
  const buffers = await loadFromDir(passesDir(slug), PASS_ASSETS);
  assetCache.set(slug, buffers);
  return buffers;
}

// Load the strip image for a given variant. Resolution order:
//   1. assets/passes/<slug>/<variantPath>/strip{,@2x,@3x}.png  (tier or "gift")
//   2. assets/passes/<slug>/strip{,@2x,@3x}.png                 (tenant default)
async function loadStripAssets(slug: string, variantPath: string | null): Promise<AssetBuffers> {
  const cacheKey = `${slug}::${variantPath || "_default"}`;
  const cached = stripCache.get(cacheKey);
  if (cached) return cached;

  const baseDir = passesDir(slug);
  const variantDir = variantPath ? join(baseDir, variantPath) : baseDir;
  let buffers = await loadFromDir(variantDir, STRIP_FILENAMES);
  if (Object.keys(buffers).length === 0 && variantPath) {
    // Variant strip missing — fall back to the tenant root strip.
    buffers = await loadFromDir(baseDir, STRIP_FILENAMES);
  }
  stripCache.set(cacheKey, buffers);
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

function money(cents: number, currency: string, locale: string = "es-AR") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

function formatLastUpdate(d: Date): string {
  // Match Juicy's format ("HH:mm DD/MM") since that's what users expect.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

// Tier perks JSON shape — kept loose at runtime; full doc lives on
// schema.prisma "Tier.perks". Only fields used by the pass renderer are
// declared here.
type TierPerks = {
  lunch_discount?: number;
  lunch_window?: string | null;
  lunch_days?: number[];
  dinner_discount?: number;
  dinner_window?: string | null;
  dinner_days?: number[];
  happy_hour_2x1?: boolean;
  happy_hour_window?: string | null;
  happy_hour_days?: number[];
  wine_upgrade_per_month?: number;
  free_dessert?: "never" | "birthday" | "always";
  welcome_drink?: boolean;
  presale_window_hours?: number;
  presale_reserved_slot?: boolean;
  merch_discount?: number;
  birthday_bottle_sku?: string | null;
  birthday_dessert?: boolean;
  chef_table_per_year?: number;
  private_party_invites?: boolean;
  waitlist_priority?: boolean;
  newsletter?: boolean;
};

// Build a 2-3 line summary of the most exciting perks for the tier, written
// for display on the back of the wallet pass. Order is intentional: lead
// with the most tangible perks (discount, presale) then the experiential
// ones (wine, dessert) then the status ones (waitlist, parties).
function summarizePerks(perks: TierPerks | null | undefined): string {
  if (!perks) return "";
  // Decide whether welcome_drink is "interesting" enough to surface. It is
  // for the entry tier (where the rest of the list is thin) but redundant
  // at higher tiers where stronger perks already dominate. Heuristic: show
  // it only if there is no presale or chef table — i.e. lower tiers.
  const showWelcomeDrink =
    perks.welcome_drink &&
    !perks.presale_reserved_slot &&
    (perks.chef_table_per_year || 0) === 0;

  const parts: string[] = [];
  if (perks.lunch_discount && perks.lunch_discount > 0) {
    parts.push(`${perks.lunch_discount}% almuerzo L-V`);
  }
  if (perks.dinner_discount && perks.dinner_discount > 0) {
    parts.push(`${perks.dinner_discount}% cena L-J`);
  }
  if (showWelcomeDrink) {
    parts.push("welcome drink en primera visita");
  }
  if (perks.happy_hour_2x1) {
    parts.push(`2x1 barra ${perks.happy_hour_window || ""}`.trim());
  }
  if (perks.presale_reserved_slot) {
    parts.push("preventa 7 días con cupo reservado");
  } else if (perks.presale_window_hours && perks.presale_window_hours > 0) {
    parts.push(`preventa eventos ${perks.presale_window_hours}h`);
  }
  if (perks.wine_upgrade_per_month && perks.wine_upgrade_per_month > 0) {
    parts.push("upgrade vino mensual");
  }
  if (perks.free_dessert === "always") {
    parts.push("postre siempre");
  } else if (perks.free_dessert === "birthday") {
    parts.push("postre en cumpleaños");
  }
  if (perks.chef_table_per_year && perks.chef_table_per_year > 0) {
    parts.push("Mesa del Chef anual");
  }
  if (perks.waitlist_priority) {
    parts.push("prioridad en lista de espera");
  }
  if (perks.private_party_invites) {
    parts.push("acceso a fiestas privadas");
  }
  return parts.join(" · ");
}

// "Te faltan $X o Y puntos para Habitué" — calculated from the next-rank
// tier's threshold minus the current period activity. Returns null if the
// card is already at the top tier.
function nextThresholdMessage(args: {
  card: { periodPoints: number; periodSpend: number };
  currentTier: { rank: number };
  tiers: { rank: number; name: string; qualifyPoints: number; qualifySpend: number }[];
  currency: string;
}): string | null {
  const next = args.tiers
    .filter((t) => t.rank > args.currentTier.rank)
    .sort((a, b) => a.rank - b.rank)[0];
  if (!next) return null;

  const pointsLeft = Math.max(0, next.qualifyPoints - args.card.periodPoints);
  const spendLeft = Math.max(0, next.qualifySpend - args.card.periodSpend);
  // Already qualified but lock-in keeps card on current tier — should not
  // normally happen since evaluateCardTier promotes immediately, but be safe.
  if (pointsLeft === 0 && spendLeft === 0) return null;

  const fragments: string[] = [];
  if (spendLeft > 0) fragments.push(money(spendLeft, args.currency));
  if (pointsLeft > 0) fragments.push(`${pointsLeft} pts`);
  return `Para ${next.name}: ${fragments.join(" o ")}`;
}

export async function buildLoyaltyPass(args: {
  tenant: Tenant;
  card: LoyaltyCard;
  tier: Tier;
  customerName: string;
  publicHost: string;
}): Promise<Buffer> {
  // The tier may carry a `stripImage` slug pointing to a per-tier strip
  // variant under assets/passes/<slug>/strips/<stripImage>/. We resolve to
  // the tenant-default strip if the tier doesn't override.
  const stripVariant = args.tier.stripImage
    ? join("strips", args.tier.stripImage)
    : null;
  const [certs, passAssets, stripAssets, latestCampaign, allTiers] = await Promise.all([
    loadCerts(),
    loadPassAssets(args.tenant.slug),
    loadStripAssets(args.tenant.slug, stripVariant),
    // Read the most recent campaign delivery for this card so the pass can
    // include the latest campaign message as a back field. Setting
    // changeMessage on that field makes iOS surface the message as a
    // lock-screen notification when the value changes.
    prisma.campaignDelivery.findFirst({
      where: { cardId: args.card.id, status: "SENT" },
      orderBy: { sentAt: "desc" },
      include: { campaign: true },
    }),
    // Fetch all tiers for the tenant so we can compute the "next threshold"
    // back field. Cheap (3-5 rows) and avoids a second round trip.
    prisma.tier.findMany({ where: { tenantId: args.tenant.id } }),
  ]);

  const assets = { ...passAssets, ...stripAssets };

  // If the tenant has a venue lat/lng configured, attach a `locations` entry
  // so iOS pops the pass on the lock screen when the user enters the area.
  // relevantText is what shows up in the suggestion. iOS uses ~100m radius.
  const venueLocation =
    args.tenant.latitude != null && args.tenant.longitude != null
      ? [{
          latitude: args.tenant.latitude,
          longitude: args.tenant.longitude,
          relevantText: args.tenant.relevantText || `Estás cerca de ${args.tenant.name}`,
        }]
      : undefined;

  const pass = new PKPass(assets, certs, {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_IDENTIFIER!,
    teamIdentifier: env.APPLE_TEAM_IDENTIFIER!,
    serialNumber: args.card.id,
    organizationName: args.tenant.name,
    // The description is what voice-over users hear — keep it descriptive.
    description: `${args.tenant.name} · ${args.tier.name}`,
    foregroundColor: "rgb(237,235,226)",
    // Sampled directly from the original strip's dominant dark pixel
    // (`rgb(16,40,24)`). Earlier the pass declared rgb(16,40,26) which
    // is two units brighter on the blue channel — invisible alone but
    // produced a visible seam between the strip image and the bands of
    // the pass that iOS fills with backgroundColor. Matching exactly to
    // the strip eliminates the patchwork.
    backgroundColor: "rgb(16,40,24)",
    labelColor: "rgb(237,235,226)",
    webServiceURL: `${args.publicHost}/v1/wallet/apple`,
    authenticationToken: args.card.id,
    ...(venueLocation ? { locations: venueLocation } : {}),
  });

  pass.type = "storeCard";
  pass.headerFields.push({
    key: "points",
    label: "Puntos",
    value: args.card.pointsBalance,
    changeMessage: "Tenés %@ puntos",
  });
  pass.secondaryFields.push(
    { key: "member_name", label: "Miembro", value: args.customerName },
    { key: "last_update", label: "Actualizado", value: formatLastUpdate(new Date()) },
  );

  // Back fields. Order is intentional: announcement (push-driven) first so
  // a fresh campaign appears at the top; then the personal membership
  // status; then static contact info; terms last.
  if (latestCampaign?.campaign?.message) {
    pass.backFields.push({
      key: "announcement",
      label: args.tenant.name,
      value: latestCampaign.campaign.message,
      changeMessage: "%@",
    });
  }

  // Two fields: the tier name (concise, used as the lock-screen notification
  // template via changeMessage) and the description (longer text, only seen
  // on the back when the pass is opened).
  pass.backFields.push({
    key: "membership",
    label: "Membresía",
    value: args.tier.name,
    changeMessage: "Bienvenido a %@",
  });
  if (args.tier.description) {
    pass.backFields.push({
      key: "membership_description",
      label: "",
      value: args.tier.description,
    });
  }

  const perksValue = summarizePerks(args.tier.perks as TierPerks | null);
  if (perksValue) {
    pass.backFields.push({
      key: "perks",
      label: "Tus beneficios",
      value: perksValue,
    });
  }

  const next = nextThresholdMessage({
    card: args.card,
    currentTier: args.tier,
    tiers: allTiers,
    currency: args.tenant.currency,
  });
  if (next) {
    pass.backFields.push({
      key: "next_tier",
      label: "Próximo nivel",
      value: next,
    });
  }

  pass.backFields.push(
    {
      key: "web",
      label: "Web",
      value: "https://chui.com.ar",
      attributedValue: '<a href="https://chui.com.ar">chui.com.ar</a>',
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      value: "+1 415 969 2279",
      attributedValue: '<a href="https://wa.me/14159692279">+1 415 969 2279</a>',
    },
    {
      key: "instagram",
      label: "Instagram",
      value: "https://www.instagram.com/chui.ba/",
      attributedValue: '<a href="https://www.instagram.com/chui.ba/">@chui.ba</a>',
    },
    {
      key: "reservations",
      label: "Reservas",
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
      label: "Términos",
      value:
        "Programa de membresía de Chuí. Los beneficios y umbrales pueden actualizarse. Los puntos no expiran mientras la cuenta esté activa.",
    },
  );

  pass.setBarcodes({ message: args.card.nfcSerial, format: "PKBarcodeFormatQR" });

  return pass.getAsBuffer();
}

export async function buildGiftPass(args: {
  tenant: Tenant;
  giftCard: GiftCard;
  // Optional metadata supplied by a public purchase flow ("Regalá Chuí").
  senderName?: string;
  recipientName?: string;
  message?: string;
  // When the buyer chooses "no mostrar el monto", we render the pass
  // without the balance so the recipient can't tell what was paid for it.
  // Staff can still look up the value internally.
  hideAmount?: boolean;
  publicHost: string;
}): Promise<Buffer> {
  // Gift card pass uses the original Chuí strip image so it shares the
  // visual identity of the loyalty pass. Balance + code go in the small
  // header/secondary fields rather than as a primary hero, per Nico:
  // smaller, no decimals, optionally hidden from the recipient.
  const [certs, passAssets, stripAssets] = await Promise.all([
    loadCerts(),
    loadPassAssets(args.tenant.slug),
    loadStripAssets(args.tenant.slug, null),
  ]);

  const assets = { ...passAssets, ...stripAssets };

  const pass = new PKPass(assets, certs, {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_IDENTIFIER!,
    teamIdentifier: env.APPLE_TEAM_IDENTIFIER!,
    serialNumber: args.giftCard.id,
    organizationName: args.tenant.name,
    description: `${args.tenant.name} · Tarjeta de regalo`,
    foregroundColor: "rgb(237,235,226)",
    backgroundColor: "rgb(16,40,24)",
    labelColor: "rgb(237,235,226)",
  });

  pass.type = "storeCard";
  // Money formatted without decimals — buyers don't think in centavos for
  // gift cards and the small label area looks cleaner without the cents.
  const balanceFormatted = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: args.tenant.currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(args.giftCard.balance / 100);

  pass.headerFields.push({ key: "type", label: "Tipo", value: "Regalo" });
  if (!args.hideAmount) {
    // Render the balance in a secondary field so it sits in the small label
    // band beneath the strip rather than as a primary hero. The hidden
    // case omits it entirely so the recipient can't see what was paid.
    pass.secondaryFields.push({
      key: "balance",
      label: "Saldo",
      value: balanceFormatted,
      changeMessage: "Saldo: %@",
    });
  }
  pass.secondaryFields.push({ key: "code", label: "Código", value: args.giftCard.code });

  if (args.message) {
    pass.backFields.push({
      key: "personal_message",
      label: args.senderName ? `De ${args.senderName}` : "Mensaje",
      value: args.message,
    });
  }
  if (args.recipientName) {
    pass.backFields.push({
      key: "recipient",
      label: "Para",
      value: args.recipientName,
    });
  }
  pass.backFields.push(
    {
      key: "redeem_terms",
      label: "Cómo se usa",
      value:
        "Mostrá este pase en Chuí. Te restamos del saldo según consumas; podés usarlo en varias visitas hasta agotarlo.",
    },
    {
      key: "web",
      label: "Web",
      value: "https://chui.com.ar",
      attributedValue: '<a href="https://chui.com.ar">chui.com.ar</a>',
    },
    {
      key: "card_id",
      label: "ID",
      value: args.giftCard.nfcSerial,
    },
    {
      key: "terms",
      label: "Términos",
      value:
        "Tarjeta de regalo de Chuí. No reembolsable, no transferible una vez utilizada parcialmente. Si perdés tu pase, contactanos con el código.",
    },
  );

  pass.setBarcodes({ message: args.giftCard.nfcSerial, format: "PKBarcodeFormatQR" });

  return pass.getAsBuffer();
}
