---
stage: 03_brief
type: agent
model: mid
effort: low
gate: review
label: Writing your brief
---
# 03 Brief

Read the evidence and write the brand brief a designer and copywriter would build the demo from. Every fact is quoted. Gaps are written as `unknown`.

## Inputs
| Layer | Path | Why |
|---|---|---|
| L4 | `02_collect/output/site.md` | The evidence. Quote from here only |
| L4 | `02_collect/output/products.raw.json` | Product names, prices, types |
| L4 | `02_collect/output/signals.json` | Colors, fonts, logo, image paths |
| L4 | `01_intake/output/input.json` | Uploads and owner notes |
| L3 | `_config/playbook.md` | What a demo needs |
| L3 | `_config/objection-framework.md` | The 4 beats |
| L3 | `_config/voice.md` | How copy should sound |
| L3 | `_config/honesty-rules.md` | Evidence rules |
| L3 | `_config/shape-catalog.md` | Packaging shapes |
| L3 | `_config/font-pairs.md` | Font pair ids |

## Process
1. Decide the category and price tier (`budget`, `mid`, `premium` or `unknown`) from the evidence.
2. Pick 3 to 5 hero products the brand sells now. Prefer the core line over merch, gift cards, bundles and devices or tools that aren't packaged goods. If the visitor uploaded a photo of a product, that product is in and is the flagship. Otherwise mark the brand's best known product as the flagship.
3. For each product: name as written, type, size, price (only if found), shape from the catalog, colors (`color`, `deep`, `ink` as hex) and an image path from `signals.json` if one matches. Up to 4 short notes, each backed by evidence.
4. Write the 4 objection beats (safe, fit, price, where) in the framework's format. Each beat lists the evidence ids behind it.
5. Pick a filter (skin type, flavor mood, heat level, roast) only if the site supports one. Each option points at one product.
6. List retailers the site names, plus the brand's own store.
7. Note the offer: a real one with evidence, or `demo` with a modest suggestion.
8. Voice notes: 3 to 5 phrases the brand actually uses, quoted.
9. Palette: background, ink, accent, accent2 as hex, from `signals.json` where possible. Pick a font pair id.
10. Build the evidence list last. Each entry has a claim, an exact quote from `site.md` and the `##` URL it sits under. Never paraphrase inside a quote.

Use exactly this structure (headings and field names are parsed by code):

```
# Brief: <Brand>
## Basics
- Brand:
- Wordmark:
- Category:
- Price tier:
- Site:
- Shop URL:
- Store locator URL:
## Hero products
### <Product name>
- Flagship: yes|no
- Type:
- Size:
- Price:
- Shape:
- Colors: color #xxxxxx, deep #xxxxxx, ink #xxxxxx
- Image:
- URL:
- Notes: note (E1); note (E4)
## Beats
### safe: <question>
- Answer:
- Body:
- Evidence: E1, E2
### fit: ...
### price: ...
### where: ...
## Filter
- Label:
- Options: option -> product name; option -> product name
## Retailers
- <Name> (E7)
## Offer
- Type: real|demo
- Text:
- Evidence:
## Hero
- Kicker:
- Headline:
- Sub:
- Evidence:
## Voice notes
- "<quoted phrase>"
## Palette
- bg #xxxxxx, ink #xxxxxx, accent #xxxxxx, accent2 #xxxxxx
- Font pair: <id>
## Evidence
### E1
- Claim:
- Quote: "<exact text from site.md>"
- Source: <url>
```

## Outputs
| Path | Why |
|---|---|
| `03_brief/output/brief.md` | The brief, with an evidence section and every claim quoted |
