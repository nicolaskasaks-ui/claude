# Outreach & business layer — turning packs into revenue

This skill produces the deliverable; this file is how you sell it. Ties directly to
the "find 50 sellers with basic static photos" prospecting work.

## The offer
Sellers with strong reviews but flat phone photos are leaving conversion on the
table. The wedge: **send them the "after" before they pay.** Run intake + the 4
packs on ONE of their hero products, build the before/after preview page, and lead
with it. Seeing their own product upgraded is a stronger hook than any pitch.

## Batch loop (per prospect)
For each seller on the prospect list:
1. Grab their best-reviewed product URL (or main image).
2. Run the skill's intake → 4 core packs (keep it cheap: 3–4 stills + 1 video +
   1 UGC clip is enough to sell).
3. Build the before/after preview HTML (`Artifact`).
4. Send it as the first-touch: "Made a quick sample of what `{product}` could look
   like — full set (X photos, Y videos, UGC) ready if you want it."
When processing many prospects, drive this as a `Workflow` fan-out (one pipeline
item per seller: intake → packs → preview) — only if the user opts into
multi-agent orchestration. Always report the total credit cost of a batch before
running it.

## Suggested pricing tiers (starting points, adjust to market)
- **Starter** — 1 product, Studio + Lifestyle packs (8–10 photos). Entry price.
- **Growth** — 1 product, all 4 packs (photos + 1 video + 1 UGC clip).
- **Full catalog / retainer** — multiple SKUs per month, all packs + ad statics +
  reframed cuts for every platform. This is the recurring-revenue play.

## Where the margin is
- Reuse the brief and reference across packs — one intake feeds everything.
- Batch generations while jobs render async (don't sit idle on one poll).
- The reframed multi-ratio outputs (9:16 / 1:1 / 16:9) turn one video into 3
  deliverables at near-zero extra cost.

## Do / don't
- **Do** keep every asset truthful to the real product and clearly generated.
- **Do** get the seller's OK before publishing anything to *their* live listing.
- **Don't** fabricate reviews, testimonials from real customers, endorsements, or
  competitor comparisons that aren't true.
- **Don't** scrape or store personal data beyond public business contact info, and
  respect each platform's messaging/outreach rules when you contact sellers.
