---
name: product-marketing-packs
description: >-
  Turn a single product link or product photo into several ready-to-send packs of
  marketing assets: hero/studio photos, lifestyle photos, short-form video, and
  UGC-style testimonial clips. Use when the user pastes an Amazon/Shopify/product
  URL or a product image and wants generated photos, video, ads, reels, or UGC —
  e.g. "make marketing for this product", "give me content packs for this listing",
  "photos + video + UGC from this link". Built to be resold as a service to sellers
  who only have basic static photos.
---

# Product Marketing Packs

Input: **one product URL or one product photo**.
Output: **multiple named packs** of finished marketing assets, organized in a client
folder, plus a one-page pitch you can send to the seller.

This skill is an orchestration recipe over the **Higgsfield** MCP (image/video/UGC
generation) and, when useful, the **Adobe** MCP (retouch, background, layout/text).
It is designed for an agency workflow: run it once per prospect, hand them the
preview, close the deal.

## When to use / not use

Use it when the user gives a product (link or photo) and wants generated visual
marketing. Do **not** use it to fabricate fake reviews, fake endorsements, or to
impersonate a real named person; UGC here means *original* actor-style creative,
clearly generated, never a real customer's likeness or identity.

## The 4 core packs (default deliverable)

Generate these by default. Scale up or down to the user's ask and to their
Higgsfield credit balance.

| # | Pack | What's in it | Primary tools |
|---|------|--------------|---------------|
| 1 | **Studio / Hero** | 4–6 clean product shots: pure-white e-comm hero, angle variations, macro detail, shadow/reflection | `remove_background`, `generate_image`, `upscale_image` |
| 2 | **Lifestyle** | 4–6 product-in-context scenes (kitchen, bedroom, outdoors, hands-in-use) matched to the product's audience | `generate_image`, `outpaint_image`, `upscale_image` |
| 3 | **Video** | 1–2 short cinematic product videos (hero rotate / reveal / feature callouts), 5–10s, 9:16 + 1:1 | `generate_video`, `reframe`, `upscale_video` |
| 4 | **UGC** | 1–2 talking-head / hands-on testimonial-style clips in the platform's native look | UGC workflow via `get_workflow_instructions`, `shorts_studio` |

Optional add-ons: **Social Ad** static creatives with text overlay (Adobe MCP /
Express), **Reels/Shorts** batch (`shorts_studio`), and a **virality score** on the
best video (`virality_predictor`).

## Process

### 0. Preconditions (Higgsfield)
Before generating, confirm the account is usable:
- `select_workspace` / `list_workspaces` — pick the working workspace.
- `balance` or `show_plans_and_credits` — check credits. Generation costs credits;
  if low, tell the user how many packs the balance realistically covers and ask
  before burning it. Report the cost estimate up front — never silently spend.

### 1. Intake — get the product in
Branch on input type:

**A) URL (Amazon / Shopify / any product page)**
1. `WebFetch` the page. Extract: product **title**, **brand**, **category**,
   **key features / bullets**, **price**, **target audience signals**, and the
   **main product image URL(s)**.
2. Pull the highest-resolution product image into Higgsfield with
   `media_import_url` (import by URL). Keep the returned media id — it is the
   **reference image** every generation anchors to.

**B) Product photo (local file)**
- In an Apps-UI client, call `media_upload_widget` so the user attaches the photo;
  otherwise `media_upload`. Keep the returned media id as the reference.
- Local attachments in plain chat cannot be read by the remote MCP — always route
  a local file through the upload tool, don't assume a path.

If the reference photo is low quality, run `upscale_image` and/or
`remove_background` first so downstream generations start clean.

### 2. Build the creative brief
Write a short brief (save it to the client folder as `brief.md`) capturing:
product name, one-line positioning, category, **audience**, **brand vibe**
(e.g. warm/minimal/premium/playful), **color palette**, top 3 selling points, and
any claims that are safe to visualize. Every prompt below inherits from this brief
so the packs feel like one campaign, not random images.

If you're unsure which model fits a given shot or clip, call
`models_explore(action:'recommend')` with the goal + the reference, then use the
recommended model in the matching `generate_*` call.

### 3. Generate each pack
Work pack by pack. For exact prompt templates, aspect ratios, counts, and the
model/tool call sequence for every shot type, **read
`references/pack-specs.md`** — it is the detailed spec; this file is the map.

Key rules that apply across all packs:
- **Anchor to the reference.** Pass the product's media id as the reference/input
  image so the *actual* product (label, shape, color) is preserved, not a
  look-alike. Do not invent product details or text on packaging.
- **Async jobs.** `generate_image` / `generate_video` / `shorts_studio` return
  jobs. Poll with `job_display` / the tool's `*_status` before treating an asset
  as done. Don't report a pack complete until its jobs resolve.
- **Finish quality.** Upscale finals (`upscale_image` / `upscale_video`), and
  `reframe` video into each aspect ratio the seller needs (9:16 for TikTok/Reels,
  1:1 for feed, 16:9 for Amazon/YouTube).
- **Truth in advertising.** Keep generated scenes plausible for the real product.
  No fake certifications, awards, or invented capabilities on-screen.

### 4. UGC pack (special handling)
UGC is a workflow, not a single call:
1. `get_workflow_instructions()` (no args) to see the catalog, then again with the
   UGC / talking-head workflow name to load its steps. Follow those steps.
2. Use `shorts_studio_create` for native TikTok/Reels-style output when the
   workflow points there.
3. The on-screen actor is a **generated persona**, never a real, named individual.
   Script the testimonial from the brief's real selling points.

### 5. Assemble & deliver
1. Put everything under `output/<brand-or-product-slug>/` with subfolders
   `01-studio/ 02-lifestyle/ 03-video/ 04-ugc/`.
2. Download finished assets locally (`asset_download_file` on the Adobe side, or
   the Higgsfield asset/download path) so the user has real files.
3. Optional: score the best clip with `virality_predictor` and include the score.
4. Build a **preview + pitch**: a single HTML page (use the `Artifact` tool, and
   load the `artifact-design` skill first) showing before (their basic photo) vs.
   after (the packs), plus a short offer. This is the thing the user sends to the
   seller. For the outreach angle and the connection to the 50-seller prospect
   list, read `references/outreach.md`.

## Scaling to the money goal

This skill is one prospect's deliverable. To run it as a business across many
sellers, batch it: for each seller on a prospect list, run intake → the 4 packs →
preview page, then send the preview as the cold-outreach hook ("here's what your
listing could look like — full set ready when you are"). `references/outreach.md`
covers pricing tiers, the batch loop, and what to actually send. When the user
wants to process many prospects at once, that's a good fit for a `Workflow` fan-out
(one pipeline item per seller) — but only if the user opts into multi-agent
orchestration.

## Guardrails
- Generated content must be labeled/understood as generated; don't pass it off as
  real photography of the physical unit when a claim depends on that distinction.
- No real person's face/voice/name as a "customer." No competitor logos.
- Respect the product's true attributes — the reference image is the source of
  truth for what the product actually looks like.
- Always surface the credit cost before large batches.
