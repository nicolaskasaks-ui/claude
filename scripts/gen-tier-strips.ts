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
  // Null badge = no stamp (used for the gift pass which only needs the
  // chroma-keyed transparent strip, no tier label).
  badge: { text: string; fill: string } | null;
};

const VARIANTS: Variant[] = [
  {
    // Used by the gift card pass; transparent strip with no badge.
    slug: "default",
    outDir: "assets/passes/chui/strips/default",
    badge: null,
  },
  {
    slug: "silver",
    outDir: "assets/passes/chui/strips/silver",
    badge: { text: "SILVER", fill: "#8A8F95" }, // muted slate
  },
  {
    slug: "gold",
    outDir: "assets/passes/chui/strips/gold",
    badge: { text: "GOLD", fill: "#B8893E" }, // warm gold
  },
  {
    slug: "platinum",
    outDir: "assets/passes/chui/strips/platinum",
    badge: { text: "PLATINUM", fill: "#C4622A" }, // deep ember
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

// Chroma-keys the dark green background out of the source strip so the
// pass.json backgroundColor shows through. This is the cleanest fix for
// the visible seam between the strip and the bands of the pass that iOS
// fills with backgroundColor (which has a subtle vertical gradient that
// a flat strip image can't match).
//
// Approach: pixels close to the brand-green sample are made fully
// transparent; everything else (the cream wordmark, the multilingual
// labels) keeps its alpha at 100%. Using Euclidean RGB distance instead
// of plain luminance keeps the darker cream Cyrillic / Arabic / CJK
// labels intact (they'd fail a flat luminance test).
const KEY_R = 16;
const KEY_G = 40;
const KEY_B = 24;
const KEY_TOLERANCE = 36; // empirically: erases the green field, preserves cream
const KEY_SQUARED = KEY_TOLERANCE * KEY_TOLERANCE;

async function chromaKeyGreen(srcBuf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(srcBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const dr = data[i] - KEY_R;
    const dg = data[i + 1] - KEY_G;
    const db = data[i + 2] - KEY_B;
    if (dr * dr + dg * dg + db * db < KEY_SQUARED) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function emit(variant: Variant) {
  const dir = join(ROOT, variant.outDir);
  await mkdir(dir, { recursive: true });

  for (const { suffix, scale } of SCALES) {
    const outPath = join(dir, `strip${suffix}.png`);
    const sourceBuf = await loadSource(scale as 1 | 2 | 3);
    // Chroma-key the green field so iOS shows backgroundColor through
    // the strip — eliminates the seam between strip and pass bands.
    const keyedStrip = await chromaKeyGreen(sourceBuf);
    const layers: sharp.OverlayOptions[] = [];
    if (variant.badge) {
      layers.push({
        input: Buffer.from(buildBadgeSvg(variant.badge.text, variant.badge.fill, scale as 1 | 2 | 3)),
        blend: "over",
      });
    }
    const buf = layers.length
      ? await sharp(keyedStrip).composite(layers).png({ compressionLevel: 9 }).toBuffer()
      : keyedStrip;
    await writeFile(outPath, buf);
    const tag = variant.badge
      ? `badge ${variant.badge.text} on ${variant.badge.fill}`
      : "no badge";
    console.log(`  ${variant.slug}@${scale}x → ${(buf.length / 1024).toFixed(1)}kb (${tag}, transparent bg)`);
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
