import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Tier strip images for the Chuí membership pass.
//
// Approach: a flat solid-green background that matches the pass body
// exactly (so there is no visible seam between strip and pass), with
// the tier name centered in white. No imagery, no embellishments —
// the strip's job is to name the tier, nothing else.
//
// Background color is rgb(16,40,24), the dominant dark green sampled
// from the original Juicy strip and now also the pass backgroundColor.
//
// Apple Wallet store-card strip dimensions:
//   1x  375 × 144
//   2x  750 × 288
//   3x 1125 × 432

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");

const GREEN = { r: 16, g: 40, b: 24 };
const WHITE = "#FFFFFF";

type Variant = {
  slug: string;
  outDir: string;
  wordmark: string;
};

const VARIANTS: Variant[] = [
  { slug: "silver", outDir: "assets/passes/chui/strips/silver", wordmark: "SILVER" },
  { slug: "gold", outDir: "assets/passes/chui/strips/gold", wordmark: "GOLD" },
  { slug: "platinum", outDir: "assets/passes/chui/strips/platinum", wordmark: "PLATINUM" },
];

const SCALES = [
  { suffix: "", scale: 1 as const },
  { suffix: "@2x", scale: 2 as const },
  { suffix: "@3x", scale: 3 as const },
];

function buildStripSvg(wordmark: string, scale: 1 | 2 | 3): string {
  const w = 375 * scale;
  const h = 144 * scale;
  // Type fills ~70% of strip width regardless of length, with letter
  // spacing baked in via SVG textLength so SILVER, GOLD and PLATINUM
  // share the same visual weight.
  const targetTextW = w * 0.7;
  const fontSize = Math.round(h * 0.32);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="rgb(${GREEN.r},${GREEN.g},${GREEN.b})"/>
  <text x="${w / 2}" y="${h / 2}" fill="${WHITE}"
        text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-weight="700"
        font-size="${fontSize}"
        textLength="${targetTextW}"
        lengthAdjust="spacingAndGlyphs">${wordmark}</text>
</svg>`;
}

async function emit(variant: Variant) {
  const dir = join(ROOT, variant.outDir);
  await mkdir(dir, { recursive: true });

  for (const { suffix, scale } of SCALES) {
    const outPath = join(dir, `strip${suffix}.png`);
    const svg = Buffer.from(buildStripSvg(variant.wordmark, scale));
    const buf = await sharp(svg)
      .png({ palette: true, quality: 90, compressionLevel: 9 })
      .toBuffer();
    await writeFile(outPath, buf);
    console.log(`  ${variant.slug}@${scale}x → ${(buf.length / 1024).toFixed(1)}kb`);
  }
}

async function main() {
  for (const v of VARIANTS) {
    console.log(`Variant ${v.slug}:`);
    await emit(v);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
