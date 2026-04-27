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
  { slug: "amigo", wordmark: "AMIGO  ·  FRIEND  ·  AMICO DE CHUÍ", trackingEm: 0.18 },
  { slug: "habitue", wordmark: "HABITUÉ DE CHUÍ", trackingEm: 0.32 },
  { slug: "cofrade", wordmark: "COFRADE DEL FUEGO", trackingEm: 0.32, embellishment: "ember-line" },
];

const GIFT: TierSpec = { slug: "gift", wordmark: "REGALO DE CHUÍ", trackingEm: 0.32 };

function buildStripSvg(spec: TierSpec, scale: 1 | 2 | 3): string {
  const w = 375 * scale;
  const h = 144 * scale;
  // Font size scales: at 1x ~22px for amigo (tri-lingual longer), ~30px for short single-word marks.
  const baseFontPx = spec.wordmark.length > 24 ? 22 : 32;
  const fontSize = baseFontPx * scale;
  const tracking = spec.trackingEm * fontSize;
  const ember = spec.embellishment === "ember-line";
  const lineY = h / 2 + fontSize * 0.55;
  const lineW = Math.min(w * 0.45, 200 * scale);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${GREEN}"/>
  <text x="${w / 2}" y="${h / 2}" fill="${CREAM}"
        text-anchor="middle" dominant-baseline="middle"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-weight="700"
        font-size="${fontSize}"
        letter-spacing="${tracking}">${spec.wordmark}</text>
  ${ember ? `<rect x="${(w - lineW) / 2}" y="${lineY}" width="${lineW}" height="${Math.max(1, scale)}" fill="${EMBER}"/>` : ""}
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
