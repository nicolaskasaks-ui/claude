import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Generates strip images for the four Chuí membership / gift passes.
//
// Each strip is composed in three layers:
//   1. base photo from chui.com.ar (resized cover-fit)
//   2. brand-green tint overlay (configurable opacity per tier)
//   3. typography layer (wordmark, optional ember accent)
//
// All three densities (1x / 2x / 3x) are emitted per strip, sized for
// Apple Wallet store-card strips: 375×144, 750×288, 1125×432.
//
// Photos are sourced from the design-brief/ folder which mirrors the
// public-facing assets on chui.com.ar.

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const PHOTOS = join(ROOT, "design-brief");

const GREEN = { r: 16, g: 40, b: 26 };
const CREAM = "#EDEBE2";
const EMBER = "#C4622A";

type TierSpec = {
  slug: string;
  outDir: string;
  wordmark: string;
  // Path to the source photo (inside design-brief/).
  photo: string;
  // 0..1 — amount of green tint applied over the photo. Higher = more
  // brand presence and less photo legibility. Top tier shows the photo
  // most, entry tier most subdued.
  tintOpacity: number;
  // Optional decorative ember rule under the wordmark. Reserved for the
  // top tier and the gift card.
  embellishment?: "ember-line";
  trackingEm: number;
};

const TIERS: TierSpec[] = [
  {
    slug: "amigo",
    outDir: "assets/passes/chui/strips/amigo",
    wordmark: "AMIGO DE CHUÍ",
    photo: "web-camino.jpg",
    tintOpacity: 0.78,
    trackingEm: 0.32,
  },
  {
    slug: "habitue",
    outDir: "assets/passes/chui/strips/habitue",
    wordmark: "HABITUÉ DE CHUÍ",
    photo: "web-hero.jpg",
    tintOpacity: 0.72,
    trackingEm: 0.32,
  },
  {
    slug: "cofrade",
    outDir: "assets/passes/chui/strips/cofrade",
    wordmark: "COFRADE DEL FUEGO",
    photo: "web-comida-2.png",
    tintOpacity: 0.62,
    trackingEm: 0.34,
    embellishment: "ember-line",
  },
  {
    slug: "gift",
    outDir: "assets/passes/chui/gift",
    wordmark: "REGALO DE CHUÍ",
    photo: "web-llanero.jpg",
    tintOpacity: 0.7,
    trackingEm: 0.32,
    embellishment: "ember-line",
  },
];

function buildTextSvg(spec: TierSpec, scale: 1 | 2 | 3): string {
  const w = 375 * scale;
  const h = 144 * scale;
  const targetTextW = w * 0.78;
  const fontSize = Math.round(h * 0.21);
  const ember = spec.embellishment === "ember-line";
  // Position the ember rule below the wordmark with breathing room.
  const lineY = h / 2 + fontSize * 0.95;
  const lineW = Math.min(w * 0.28, 140 * scale);

  // Subtle drop shadow behind the wordmark — improves legibility on the
  // photo even with the brand-green tint applied. Cream text on dark
  // green-photo composite already has decent contrast; this is just for
  // the rare bright pixel that pokes through.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="soft" x="-5%" y="-15%" width="110%" height="130%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${1 * scale}"/>
      <feOffset dx="0" dy="${1 * scale}" result="shadow"/>
      <feFlood flood-color="rgba(0,0,0,0.35)"/>
      <feComposite in2="shadow" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <text x="${w / 2}" y="${h / 2}" fill="${CREAM}" filter="url(#soft)"
        text-anchor="middle" dominant-baseline="middle"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-weight="700"
        font-size="${fontSize}"
        textLength="${targetTextW}"
        lengthAdjust="spacingAndGlyphs">${spec.wordmark}</text>
  ${ember ? `<rect x="${(w - lineW) / 2}" y="${lineY}" width="${lineW}" height="${Math.max(2, scale * 1.5)}" fill="${EMBER}"/>` : ""}
</svg>`;
}

async function buildStrip(spec: TierSpec, scale: 1 | 2 | 3): Promise<Buffer> {
  const w = 375 * scale;
  const h = 144 * scale;

  // Step 1 — load and cover-fit the photo to the strip dimensions.
  const photo = await sharp(join(PHOTOS, spec.photo))
    .resize(w, h, { fit: "cover", position: "center" })
    .toBuffer();

  // Step 2 — brand-green tint overlay. We render a small RGBA rectangle
  // and let sharp scale it; alternatively we could pipe a SVG, but a raw
  // raw-pixel buffer is fastest. The opacity is per tier.
  const alpha = Math.round(255 * spec.tintOpacity);
  const tintPng = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: GREEN.r, g: GREEN.g, b: GREEN.b, alpha: spec.tintOpacity },
    },
  })
    .png()
    .toBuffer();

  // Step 3 — typography layer rendered as transparent SVG.
  const text = Buffer.from(buildTextSvg(spec, scale));

  return sharp(photo)
    .composite([
      { input: tintPng, blend: "over" },
      { input: text, blend: "over" },
    ])
    // Palette-quantized PNG (PNG-8 with up to 256 colors). The strip is
    // dominated by the green tint plus a few photo tones plus cream text,
    // so 256 colors is plenty and the file shrinks 3-5x vs PNG-24. This
    // matters: Vercel bundle stays under the 50MB limit and the .pkpass
    // download is faster on the customer's phone.
    .png({ palette: true, quality: 90, compressionLevel: 9 })
    .toBuffer();
}

async function emit(spec: TierSpec) {
  const dir = join(ROOT, spec.outDir);
  await mkdir(dir, { recursive: true });
  for (const scale of [1, 2, 3] as const) {
    const buf = await buildStrip(spec, scale);
    const suffix = scale === 1 ? "" : `@${scale}x`;
    const outPath = join(dir, `strip${suffix}.png`);
    // Write the palette-quantized buffer directly. Re-piping through sharp
    // (sharp(buf).toFile()) would decode and re-encode without the palette
    // option, ballooning the file ~3x.
    await writeFile(outPath, buf);
    console.log(`  ${spec.slug}@${scale}x → ${outPath} (${(buf.length / 1024).toFixed(1)}kb)`);
  }
}

async function main() {
  for (const spec of TIERS) {
    console.log(`Tier ${spec.slug} (photo: ${spec.photo}, tint: ${spec.tintOpacity}):`);
    await emit(spec);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
