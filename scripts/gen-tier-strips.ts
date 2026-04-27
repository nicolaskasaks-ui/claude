import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Tier strip variants for the Chuí membership pass.
//
// Approach: keep the original AMIGO/FRIEND/AMICO DE CHUÍ strip exactly as
// designed and add a small badge in the bottom-right corner with the tier
// name. Same convention Amex uses for Gold / Platinum / Black: identical
// card silhouette, single distinguishing mark.
//
// Silver gets no badge — it is the entry tier and the strip's wordmark
// already reads as Chuí Friends.
//
// The gift card pass intentionally has no strip so the prepaid balance
// can sit in the primary field without overlapping a hero image.

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const SOURCE_DIR = join(ROOT, "assets/passes/chui");

const CREAM = "#EDEBE2";
const EMBER = "#C4622A";

type Variant = {
  slug: string;
  outDir: string;
  // null = use the source strip unmodified (Silver case).
  badge: { text: string; stroke: string } | null;
};

const VARIANTS: Variant[] = [
  {
    slug: "silver",
    outDir: "assets/passes/chui/strips/silver",
    badge: null,
  },
  {
    slug: "gold",
    outDir: "assets/passes/chui/strips/gold",
    badge: { text: "GOLD", stroke: CREAM },
  },
  {
    slug: "platinum",
    outDir: "assets/passes/chui/strips/platinum",
    badge: { text: "PLATINUM", stroke: EMBER },
  },
];

const SCALES = [
  { suffix: "", scale: 1 },
  { suffix: "@2x", scale: 2 },
  { suffix: "@3x", scale: 3 },
] as const;

function buildBadgeSvg(
  text: string,
  stroke: string,
  scale: 1 | 2 | 3,
): string {
  const w = 375 * scale;
  const h = 144 * scale;
  const fontSize = 10 * scale;
  const padX = 9 * scale;
  const padY = 5 * scale;
  const charW = fontSize * 0.78;
  const tracking = 0.18 * fontSize;
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
  <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="${r}" ry="${r}"
        fill="none" stroke="${stroke}" stroke-width="${1 * scale}"/>
  <text x="${x + boxW / 2}" y="${y + boxH / 2}" fill="${stroke}"
        text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-weight="700"
        font-size="${fontSize}"
        letter-spacing="${tracking}">${text}</text>
</svg>`;
}

// Returns the source strip at the requested density, upscaling from the
// closest available size if the exact one is missing (the original ships
// at 1x and 2x only).
async function loadSource(scale: 1 | 2 | 3): Promise<Buffer> {
  const w = 375 * scale;
  const h = 144 * scale;
  const exact = join(SOURCE_DIR, scale === 1 ? "strip.png" : `strip@${scale}x.png`);
  try {
    return await sharp(exact).toBuffer();
  } catch {
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

    if (!variant.badge) {
      await writeFile(outPath, sourceBuf);
      console.log(`  ${variant.slug}@${scale}x → source unchanged`);
      continue;
    }

    const overlay = Buffer.from(
      buildBadgeSvg(variant.badge.text, variant.badge.stroke, scale as 1 | 2 | 3),
    );
    const buf = await sharp(sourceBuf)
      .composite([{ input: overlay, blend: "over" }])
      .png({ palette: true, quality: 90, compressionLevel: 9 })
      .toBuffer();
    await writeFile(outPath, buf);
    console.log(
      `  ${variant.slug}@${scale}x → ${(buf.length / 1024).toFixed(1)}kb (badge: ${variant.badge.text})`,
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
