import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Tier strip variants for the Chuí membership pass.
//
// The base is the original AMIGO/FRIEND/AMICO DE CHUÍ strip exactly as
// designed. Silver / Gold / Platinum each add one small solid badge in
// the bottom-right corner, distinguished only by fill color, with the
// tier name in white inside. Same convention Amex uses: identical card
// silhouette, single discreet stamp.
//
//   Silver   → muted slate fill
//   Gold     → warm gold fill
//   Platinum → deep ember fill
//
// The wordmark on the source strip already reads as Chuí Friends, so the
// badge alone is enough to communicate the tier without competing with
// the existing typography.

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const SOURCE_DIR = join(ROOT, "assets/passes/chui");

const WHITE = "#FFFFFF";

type Variant = {
  slug: string;
  outDir: string;
  text: string;
  // Solid fill for the badge — what differentiates the three tiers.
  fill: string;
};

const VARIANTS: Variant[] = [
  {
    slug: "silver",
    outDir: "assets/passes/chui/strips/silver",
    text: "SILVER",
    fill: "#8A8F95", // muted slate
  },
  {
    slug: "gold",
    outDir: "assets/passes/chui/strips/gold",
    text: "GOLD",
    fill: "#B8893E", // warm gold
  },
  {
    slug: "platinum",
    outDir: "assets/passes/chui/strips/platinum",
    text: "PLATINUM",
    fill: "#C4622A", // deep ember
  },
];

const SCALES = [
  { suffix: "", scale: 1 as const },
  { suffix: "@2x", scale: 2 as const },
  { suffix: "@3x", scale: 3 as const },
];

// Renders a transparent SVG with a single small filled badge in the
// bottom-right corner. White tier name is centered inside.
function buildBadgeSvg(text: string, fill: string, scale: 1 | 2 | 3): string {
  const w = 375 * scale;
  const h = 144 * scale;
  const fontSize = 9 * scale;
  const padX = 10 * scale;
  const padY = 5 * scale;
  // Approximate text width (Helvetica Bold UC + tracking 0.16em).
  const charW = fontSize * 0.78;
  const tracking = 0.16 * fontSize;
  const textW = text.length * charW + (text.length - 1) * tracking;
  const boxW = textW + padX * 2;
  const boxH = fontSize + padY * 2;
  const marginX = 14 * scale;
  const marginY = 14 * scale;
  const x = w - boxW - marginX;
  const y = h - boxH - marginY;
  const r = 2 * scale;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="${r}" ry="${r}" fill="${fill}"/>
  <text x="${x + boxW / 2}" y="${y + boxH / 2}" fill="${WHITE}"
        text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-weight="700"
        font-size="${fontSize}"
        letter-spacing="${tracking}">${text}</text>
</svg>`;
}

async function loadSource(scale: 1 | 2 | 3): Promise<Buffer> {
  const w = 375 * scale;
  const h = 144 * scale;
  const exact = join(SOURCE_DIR, scale === 1 ? "strip.png" : `strip@${scale}x.png`);
  try {
    return await sharp(exact).toBuffer();
  } catch {
    // The original ships at 1x and 2x only; upscale @2x → @3x.
    const fallback = scale === 3
      ? join(SOURCE_DIR, "strip@2x.png")
      : join(SOURCE_DIR, "strip.png");
    return sharp(fallback).resize(w, h, { kernel: "lanczos3" }).toBuffer();
  }
}

async function emit(variant: Variant) {
  const dir = join(ROOT, variant.outDir);
  await mkdir(dir, { recursive: true });

  for (const { suffix, scale } of SCALES) {
    const outPath = join(dir, `strip${suffix}.png`);
    const sourceBuf = await loadSource(scale as 1 | 2 | 3);
    const overlay = Buffer.from(buildBadgeSvg(variant.text, variant.fill, scale as 1 | 2 | 3));
    const buf = await sharp(sourceBuf)
      .composite([{ input: overlay, blend: "over" }])
      .png({ palette: true, quality: 90, compressionLevel: 9 })
      .toBuffer();
    await writeFile(outPath, buf);
    console.log(
      `  ${variant.slug}@${scale}x → ${(buf.length / 1024).toFixed(1)}kb (badge ${variant.text} on ${variant.fill})`,
    );
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
