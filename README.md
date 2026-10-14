# tycodes demo generator

Paste a business website and get back a shoppable 3D scroll demo of its products, built from the brand's own words and checked against its own site. It is the engine behind [tycodes.app](https://tycodes.app) (launching soon).

> Status: **Phase 2 of 5.** The pipeline runs locally from the command line, and one prebuilt 3D template renders any generated config. Cloudflare deployment and the public site come next.

## How it works

The pipeline follows **Interpretable Context Methodology** (ICM): each stage is a folder with a plain-markdown contract, stages talk only through files, and a human can open, edit and re-run any stage.

```
workspace/                       the pipeline definition (one source of truth)
  CLAUDE.md                      L0  identity and rules that never bend
  CONTEXT.md                     L1  stage list and routing
  _config/                       L3  the factory: playbook, voice, honesty rules,
                                     config schema, shapes, font pairs, objection beats
  shared/examples/               L3  known-good brand configs
  stages/
    01_intake/   CONTEXT.md      L2  contract: Inputs / Process / Outputs
    02_collect/  CONTEXT.md      L2
    03_brief/    CONTEXT.md      L2
    04_config/   CONTEXT.md      L2
    05_verify/   CONTEXT.md      L2
    06_publish/  CONTEXT.md      L2
runs/<id>/stages/NN/output/      L4  the product: this run's files (local only, never committed)
```

| Stage | Type | What it does |
|---|---|---|
| 01 intake | script | Normalizes the URL, SSRF and robots.txt checks, catches parked domains, saves uploads |
| 02 collect | script | Reads up to 8 pages politely, pulls JSON-LD, the Shopify catalog, colors, fonts and images, and writes `site.md`, the evidence file |
| 03 brief | agent | Writes the brand brief: hero products, 4 objection beats, palette, voice, every fact quoted |
| 04 config | agent | Turns the brief into `brand.config.json` (zod-validated, one retry with errors) |
| 05 verify | script + small model | Drops anything that doesn't trace to the site, fixes contrast and dashes, sends heavy drops to human review |
| 06 publish | script | Writes the demo config and re-hosted images |

**The Inputs table is the control point.** The runner parses each stage's `## Inputs` table and loads only those files, so editing the markdown changes what the model sees. Agent prompts are assembled in order (L0, L1, L2, `REFERENCE`, `WORKING INPUT`) and saved next to the outputs as `prompt.md`.

**Configure the factory, not the product.** No code is generated per demo. One template renders any `brand.config.json`. Tuning happens in the L3 markdown.

### Honesty rules
- Every claim, price and retailer must trace to text scraped from the brand's own site (URL plus exact quote). Anything else is dropped by stage 05.
- Reviews and ratings are never generated. Invented offers are tagged as demo offers.
- Demos are labeled concepts: unlisted, `noindex`, expiring, with a "not affiliated" credit. Checkout links go to the brand's real site.
- Scraping is polite: honest User-Agent (`tycodes-demo-bot/1.0`), robots.txt respected, 8 pages max, no Instagram scraping. Blocked sites get a request for uploads instead.

## Run it locally

Requires Node 20+.

```bash
npm install
cp .env.example .env        # then add ANTHROPIC_API_KEY
npm run pipeline -- --url https://drinkculturepop.com
```

Useful commands:

```bash
npm run pipeline -- --list                              # all runs
npm run pipeline -- --run <id> --status                 # stage status, timings, tokens, cost
npm run pipeline -- --run <id> --from 04_config         # re-run from a stage after editing an output
npm run pipeline -- --approve <id>                      # continue a run waiting for review
npm run pipeline -- --url https://brand.com --image label.png:label --paste notes.txt
npm test
```

Models are set in `.env` (`MODEL_STRONG`, `MODEL_CHEAP`). Every model call is logged with tokens and cost. `DAILY_SPEND_CAP_USD` (default $5) is a hard cap: each call reserves its worst-case cost first, so a call that could cross the cap is never sent.

## The template

`template/` is one Vite + React + three.js build that renders any `brand.config.json` at runtime. Shapes are parametric (can, bottle, dropper, jar, tube, tub, and a photo slab for anything else), fonts come from the curated pairs in `_config/font-pairs.md`, and a static version serves low-end devices, reduced motion and `?variant=static`.

```bash
cd template && npm install
npm run dev                     # http://localhost:5181/d/<slug> renders demos/<slug>/ from a local run
npm run build && npm run serve  # production build served the way the Worker will (http://localhost:5182/d/<slug>)
```

`/d/example-bubble` and `/d/example-culture-pop` render the L3 example configs. Add `?debug=1` for live analytics and `?variant=static` for the fallback.

## Credits

The pipeline structure follows **Interpretable Context Methodology** by Van Clief and McDermott ([arXiv:2603.16021](https://arxiv.org/abs/2603.16021)), released under the MIT license.

## License

MIT. See [LICENSE](LICENSE).
