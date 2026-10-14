---
stage: 04_config
type: agent
model: mid
gate: auto
label: Designing your demo
---
# 04 Config

Turn the brief into a `brand.config.json` the template can render without code changes. The brief is the source of truth, including any edits a human made to it. Don't add facts the brief doesn't have.

## Inputs
| Layer | Path | Why |
|---|---|---|
| L4 | `03_brief/output/brief.md` | Products, beats, palette, evidence |
| L4 | `02_collect/output/signals.json` | Logo and image paths |
| L4 | `01_intake/output/input.json` | Uploaded label art and photos |
| L3 | `_config/config-schema.json` | The exact shape to return |
| L3 | `shared/examples/*.json` | Known-good configs. Copy structure and tone, never facts |
| L3 | `_config/voice.md` | Copy style |

## Process
1. Map the brief into the schema field by field. Product ids are lowercase slugs of the names.
2. `featuredIndex` is the flagship product from the brief (a product the visitor uploaded a photo of always wins).
3. Copy the brief's evidence list into `evidence` unchanged. Every `claimIds`, `noteIds`, `subIds` and retailer `claimId` must point at an id in that list.
4. `claims`: up to 6 chips of 2 to 5 words, each with its evidence id.
5. Beats: keep the brief's questions and answers. `proof` is `claims` for safe, `filter` for fit (or `products` if there is no filter), `price` for price, `retailers` for where.
6. Uploads beat scraped images. Match each upload to the product it names (`product` in input.json); with no name, it belongs to the flagship. Kind `label` sets that product's `label`. Kind `photo` sets that product's `image` and keeps its packaging shape (the template wraps the photo on the shape). Use `shape: "photo"` only when no packaging shape fits. Use run paths exactly as given (`01_intake/output/uploads/...`, `02_collect/output/images/...`).
7. `offer`: real offers keep their evidence id and `isDemo: false`. Anything else is `isDemo: true`, `claimId: null`.
8. `shop.bundleLabel` fits the category (routine for skincare, pack for drinks, bundle otherwise). `bundleDiscount` is 0.1 to 0.15 when the offer is a demo.
9. `reviews` stays `{rating: null, count: null, quotes: []}` unless the intake supplied real ones.
10. `credit` is exactly: "Concept demo by tycodes.dev. Not affiliated with or endorsed by <Brand>."
11. `checkoutUrl` is the brand's shop page. `storeLocatorUrl` only if the brief has one.
12. In `notes`, explain the main choices (featured product, palette, font pair, shapes, filter) in a short markdown list.

## Outputs
| Path | Why |
|---|---|
| `04_config/output/brand.config.json` | Schema-valid config |
| `04_config/output/config-notes.md` | The choices made and why |
