---
stage: 02_collect
type: script
gate: auto
label: Reading your site
---
# 02 Collect

Read the brand's own site politely and keep everything as evidence. No model call.

## Inputs
| Layer | Path | Why |
|---|---|---|
| L4 | `01_intake/output/input.json` | URL, uploads and pasted info |
| L4 | `01_intake/output/uploads/` | Owner images |

## Process
1. Fetch the homepage, then up to 7 more same-domain pages most likely to be products, about, ingredients, shop, FAQ or store locator. 8 pages max. Honest User-Agent, robots.txt respected, 10 s timeout, 2 MB cap.
2. Pull title, meta and og tags, JSON-LD `Product` / `Organization` / `Offer`, `theme-color`, CSS custom properties, font families, the logo and product images.
3. Probe Shopify's public `/products.json`. Keep a condensed product list.
4. Write `site.md`: clean text grouped by page, each page's URL as a `##` heading. Lines repeated on every page (menus) appear once. Owner-pasted text goes under `## owner:pasted`. Keep it under about 18,000 characters so stage 03 stays in budget.
5. Re-host up to 8 images (logo first, then product images) after checking type and size. Never hotlink.
6. If the site blocks us (robots.txt, 401/403, captcha) and the owner gave no pasted info or uploads, stop and ask for them. Don't scrape anyway.
7. If the homepage text is under about 500 characters, the site is JS-rendered. Flag `needsRender` (the Worker uses Browser Run).

## Outputs
| Path | Why |
|---|---|
| `02_collect/output/site.md` | The evidence file. Every quote must come from here |
| `02_collect/output/products.raw.json` | Condensed products from JSON-LD and Shopify |
| `02_collect/output/signals.json` | Colors, fonts, logo, images |
| `02_collect/output/images/` | Re-hosted images |
