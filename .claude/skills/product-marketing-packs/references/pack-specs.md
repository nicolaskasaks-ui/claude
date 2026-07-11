# Pack specs — exact shots, prompts, ratios, tool calls

All prompts inherit from `brief.md` (product name, audience, vibe, palette, top-3
selling points). Everywhere below, **REF** = the product's Higgsfield media id from
intake. Always pass REF as the input/reference image so the real product is
preserved. Replace `{...}` placeholders from the brief.

Aspect ratios by destination:
- Amazon main / gallery: **1:1** (square), min 2000px → `upscale_image`.
- Shopify hero / web: **4:5** or **1:1**.
- TikTok / Reels / Shorts: **9:16**.
- YouTube / landscape ad: **16:9**.

---

## Pack 1 — Studio / Hero (4–6 stills)

Goal: replace the seller's flat phone photo with clean, conversion-grade e-comm shots.

1. `remove_background(REF)` → clean cutout `REF_CUT`.
2. Generate each shot with `generate_image`, input image = REF (or REF_CUT), 1:1:
   - **Hero white**: "`{product}` centered on seamless pure-white studio background,
     soft even softbox lighting, subtle contact shadow, ultra-sharp, e-commerce
     product photography, no props".
   - **Angle 3/4**: same, "three-quarter angle, slight top-down, gentle reflection
     on a glossy white surface".
   - **Macro detail**: "extreme close-up on `{key material/texture}`, shallow depth
     of field, highlighting quality and craftsmanship".
   - **Color/variant** (if multiple): one hero per variant, consistent framing.
   - **Scale/context prop** (optional): "next to a simple neutral prop for scale".
3. `upscale_image` every keeper to 2K/4K.
Keep the product's label/logo/shape identical to REF — do not restyle packaging.

---

## Pack 2 — Lifestyle / In-context (4–6 stills)

Goal: show the product living in the buyer's world. Pick scenes from the audience in
the brief (e.g. kitchenware → bright modern kitchen; pet → cozy living room with a
dog; skincare → spa-clean bathroom vanity).

1. `generate_image`, input = REF, per scene (mix 1:1 and 4:5):
   - **In-use / hands**: "`{person from audience}` using `{product}` in
     `{setting}`, natural window light, candid lifestyle photography, `{vibe}` mood,
     `{palette}` tones".
   - **Flat-lay / styled**: "top-down flat lay of `{product}` with `{2-3 complementary
     props}` on `{surface}`, editorial styling".
   - **Environment / on-shelf**: "`{product}` placed in `{realistic environment}`,
     depth, bokeh background".
   - **Seasonal / hook**: one scene tied to a season or use-occasion for ads.
2. If a scene needs more room for text or a different crop, `outpaint_image` to
   extend the canvas, then `upscale_image`.
Keep scenes plausible for the real product; no invented features or claims on screen.

---

## Pack 3 — Video (1–2 clips, 5–10s each)

Goal: motion for the listing, ads, and organic social.

1. Pick a best still (usually the Pack 1 hero or a strong Pack 2 scene) as the
   video's first frame.
2. `generate_video`, input image = that still. Prompt patterns:
   - **Hero rotate/reveal**: "slow 360 turntable of `{product}` on seamless
     background, cinematic soft light, premium product commercial, subtle push-in".
   - **Feature callout**: "camera glides across `{product}` highlighting
     `{selling point 1}` then `{selling point 2}`, elegant motion, `{vibe}`".
   - **Lifestyle motion**: animate a Pack 2 scene — "`{subject}` uses `{product}`,
     gentle handheld motion, warm natural light".
3. Poll `job_display` until render completes.
4. `reframe` the master into each needed ratio (9:16, 1:1, 16:9).
5. `upscale_video` the finals.
6. Optional audio bed: `generate_audio` for a short music/sfx track if the user
   wants sound-on delivery.

---

## Pack 4 — UGC (1–2 talking-head / hands-on clips)

Goal: native, creator-style content that converts on TikTok/Reels — the format these
sellers are missing entirely.

1. `get_workflow_instructions()` → find the UGC / talking-head / ad workflow in the
   catalog. Then `get_workflow_instructions("<that workflow name>")` and **follow its
   steps exactly** (it may require `get_workflow_bundle_file` for a script template).
2. Script from the brief: hook → problem → `{product}` as solution → 2 real selling
   points → soft CTA. 15–30s, spoken in first person by a **generated persona**.
3. When the workflow points to short-form assembly, use `shorts_studio_create`
   (check `shorts_studio_status`; list presets with `shorts_studio_list_presets`).
4. Output 9:16. Keep the persona generic and clearly synthetic — never a real named
   customer, never a real face/voice.

---

## Optional add-ons

- **Social ad statics (with text overlay):** take a Pack 1/2 image and use the Adobe
  MCP — `fill_text` / layout render, or `export_html_to_express` for a designed
  creative — to add headline + CTA. Load `create_visual_design_express_skill` first
  for the design workflow. Keep copy truthful.
- **Reels/Shorts batch:** `shorts_studio_create` across several hooks for A/B testing.
- **Virality check:** `virality_predictor` on the best clip; include the score and its
  hook/retention notes in the delivery.

## Async & failure handling
- Every `generate_*` and `shorts_studio_*` call is async → always poll the matching
  status/`job_display` before downloading or marking done.
- If a generation drifts from the real product (wrong label/color/shape), regenerate
  with a tighter prompt and the reference re-emphasized; don't ship an off-brand asset.
- Track a simple checklist per pack so nothing is silently dropped.
