import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Generates placeholder strip images for the three Chuí membership tiers.
// These are PLACEHOLDERS to validate the per-tier asset loading mechanism;
// they should be replaced by Figma-designed exports before launch.
//
// Apple Wallet store-card strip dimensions:
//   1x: 375 x 144 px
//   2x: 750 x 288 px
//   3x: 1125 x 432 px
// Apple displays the largest available size for the device.
//
// Brand: deep green rgb(16,40,26), cream rgb(237,235,226), Futura-style
// uppercase wordmark. We use the system "Helvetica Neue Bold" as a
// reasonable Futura proxy at this stage.

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");

const GREEN = "#10281A"; // rgb(16,40,26)
const CREAM = "#EDEBE2"; // rgb(237,235,226)
const EMBER = "#C4622A"; // rgb(196,98,42)

type TierSpec = {
  slug: string;
  wordmark: string;
  embellishment?: "ember-line";
  trackingEm: number; // letter-spacing in em-equivalent units
};

const TIERS: TierSpec[] = [
  // Single-language wordmark for the placeholder. The Figma export for
  // launch can restore the trilingual greeting "AMIGO · FRIEND · AMICO
  // DE CHUÍ" if desired, with proper kerning and either two lines or a
  // narrower font.
  { slug: "amigo", wordmark: "AMIGO DE CHUÍ", trackingEm: 0.32 },
  { slug: "habitue", wordmark: "HABITUÉ DE CHUÍ", trackingEm: 0.32 },
  { slug: "cofrade", wordmark: "COFRADE DEL FUEGO", trackingEm: 0.32, embellishment: "ember-line" },
];

const GIFT: TierSpec = { slug: "gift", wordmark: "REGALO DE CHUÍ", trackingEm: 0.32 };

function buildStripSvg(spec: TierSpec, scale: 1 | 2 | 3): string {
  const w = 375 * scale;
  const h = 144 * scale;
  // Reserve ~85% of strip width for the wordmark so the text never clips.
  // We use SVG textLength to force the rendered string to fit that width
  // regardless of character count, which gives a consistent visual rhythm
  // across tiers without manual font tuning per wordmark length.
  const targetTextW = w * 0.82;
  // Pick a font size proportional to the strip height so vertical balance
  // holds at any DPR.
  const fontSize = Math.round(h * 0.21);
  const ember = spec.embellishment === "ember-line";
  const lineY = h / 2 + fontSize * 0.85;
  const lineW = Math.min(w * 0.32, 160 * scale);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${GREEN}"/>
  <text x="${w / 2}" y="${h / 2}" fill="${CREAM}"
        text-anchor="middle" dominant-baseline="middle"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-weight="700"
        font-size="${fontSize}"
        textLength="${targetTextW}"
        lengthAdjust="spacingAndGlyphs">${spec.wordmark}</text>
  ${ember ? `<rect x="${(w - lineW) / 2}" y="${lineY}" width="${lineW}" height="${Math.max(2, scale * 1.5)}" fill="${EMBER}"/>` : ""}
</svg>`;
}

async function emit(spec: TierSpec, dir: string) {
  await mkdir(dir, { recursive: true });
  for (const scale of [1, 2, 3] as const) {
    const svg = buildStripSvg(spec, scale);
    const suffix = scale === 1 ? "" : `@${scale}x`;
    const outPath = join(dir, `strip${suffix}.png`);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath);
    console.log(`  wrote ${outPath} (${scale}x)`);
  }
}

async function main() {
  for (const t of TIERS) {
    const dir = join(ROOT, "assets/passes/chui/strips", t.slug);
    console.log(`Tier ${t.slug}:`);
    await emit(t, dir);
  }
  console.log(`Gift card:`);
  await emit(GIFT, join(ROOT, "assets/passes/chui/gift"));
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
