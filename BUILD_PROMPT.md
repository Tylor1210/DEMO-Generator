# Build brief: tycodes Demo Generator

You are building a public web app on Cloudflare. A visitor enters a business website (plus an optional Instagram link and/or product images), and the app produces a shoppable 3D scroll demo of their products. It uses my demo methods, and the pipeline follows Interpretable Context Methodology (ICM).

Work in phases (bottom of this file). **Stop at the end of every phase**, show me what you built and how to check it, and wait for my go-ahead. Those stops are the human review gates ICM is built around.

---

## 0a. Where things actually stand (read this before anything else)
- **Only one demo is finished: Culture Pop** (`../drink brands/culture-pop/`, v1 template, pushed to https://github.com/Tylor1210/culturepopdemo). It has been run, reviewed and improved by Claude Code. Its `CLAUDE.md` describes the current state. **Treat it as the quality benchmark:** a generated demo should look at least this good.
- **Bubble (`../cosmetics/bubble/`) is unfinished.** The v2 source code was written (objection beats, buy bar, left-to-right shop, routine box, analytics, static fallback), but I have never installed or run it on my machine, and no one has reviewed it on a real device. Use it as **reference code for the v2 features**, not as proven code. Before building the template on it (Phase 2), run `npm install` and `npm run dev`, test it on desktop and mobile, and fix what's broken.
- **The third preset brand doesn't exist yet.**
- **Don't hand-build the Bubble demo or the third preset.** The landing-page presets (section 1c) must be **produced by this app's own pipeline**; that's the proof it works. I'll check them against the hand-built Culture Pop. Culture Pop also gets regenerated through the pipeline as a preset, so we can compare the generated version with the hand-built one.

## 0b. GitHub (public repo)
- This app goes in its own **public** repo on my GitHub account `Tylor1210`. Suggested name: `tycodes-app` (ask me to confirm the name before creating it).
- Create it with the GitHub CLI once Phase 1 is approved: `gh repo create Tylor1210/tycodes-app --public --source . --push`. If `gh` isn't installed or logged in, tell me the exact commands to run.
- **Commit after each phase, and push only after I approve that phase** (the review gate). Use clear commit messages ("Phase 1: ICM workspace + local CLI").
- **Because the repo is public:**
  - **Never commit secrets.** Keys go in `wrangler secret put` (production) and `.dev.vars` (local). `.dev.vars`, `.env*`, `runs/`, `node_modules/`, `dist/` and `.wrangler/` must all be in `.gitignore`. Add a pre-commit secret scan (gitleaks or a simple grep hook), and check `git status` before every push.
  - **The Turnstile site key is public by design; the secret key is not.**
  - **Don't commit scraped run data.** `runs/` stays local or in R2. The only brand configs in the repo are the 3 presets in `workspace/shared/examples/`, each with its source URLs listed.
  - **Don't commit `docs/icm-paper.pdf`** (add it to `.gitignore`). Link to the arXiv page (https://arxiv.org/abs/2603.16021) and the ICM repo in the README instead, and credit ICM (MIT) properly.
  - **Ask me which license to use** for this repo (MIT is my default guess).
  - **Write a real README:** what it is, a screenshot/GIF of the how-it-works flow, how ICM structures the pipeline (a folder tree with layer labels), local setup, deploy steps and a link to the live site. This repo is also a portfolio piece.
- In Phase 5, add a GitHub Actions workflow that deploys to Cloudflare on pushes to `main`, using a `CLOUDFLARE_API_TOKEN` repo secret (tell me how to create it with the minimum permissions).

## 0. Read first
1. `docs/icm-paper.pdf`: the ICM paper (Van Clief & McDermott, arXiv 2603.16021). Also skim https://github.com/RinDig/Interpretable-Context-Methodology-ICM- for the reference workspace layout.
2. `../PLAYBOOK.md`: my rules for every demo. They become Layer 3 reference material. Note that its table lists Bubble as v2, but per section 0a it's unverified.
3. `../drink brands/culture-pop/`: the one finished demo, and the quality benchmark. Read its `CLAUDE.md`.
4. `../cosmetics/bubble/`: unverified v2 reference code (React + R3F + GSAP + Lenis). Read its `CLAUDE.md`. After you've run and fixed it in Phase 2, it becomes the base for the renderer.
5. `../drink brands/culture-pop/src/scene/Can.jsx`: the can shape to port into the template.

## 1. What I want
- **This is my main app at `https://tycodes.app/`.** The root domain is empty today, so the generator *is* the homepage. Routes:
  - `/`: landing page with the showcase demo (section 1b) and the form
  - `/build/:runId`: progress page
  - `/d/:slug`: finished demos
  - `/admin`: my admin area
  - `/privacy`, `/terms`
  - Keep the hostname in an env var anyway.
  - The form takes: website URL (required), Instagram URL (optional), up to 4 product images (optional), and for each image a choice of "label artwork" or "product photo".
  - Also: email (required, so I get the lead), "I own or work for this business" checkbox, and a Turnstile check.
- **After submit:** a progress page that polls and shows each stage finishing, in plain words ("Reading your site", "Writing your brief", ...).
- **When it's done:** the demo lives at `tycodes.app/d/<slug>`. It's unlisted, `noindex`, expires after 30 days (env var), and has a footer: "Concept demo by tycodes.dev. Not affiliated with or endorsed by <Brand>." It also carries the conversion layer in section 1b.
- **Admin area** for me only, behind Cloudflare Access (free Zero Trust):
  - every run and its full stage folder tree
  - read and edit any stage output
  - "re-run from stage N", approve/publish, unpublish, delete
  - leads list with CSV export
  - per-demo analytics

## 1b. The goal is booked calls (conversion layer)
This app exists to get businesses to **book a call and buy**. Every screen pushes toward that, without ever blocking the demo itself.

**Booking.** One env var, `BOOKING_URL`: a free Cal.com (or Calendly) link. Open it in an embedded modal where possible, so people stay on the page. Track `booking_open`, `booking_click` and `booking_done` (if the embed fires a completion event).

**On every generated demo (`/d/:slug`):**
- **Demo warning bar,** fixed at the top, not dismissible: "Concept demo built by tycodes.dev. Not associated with or endorsed by <Brand>." Keep it slim so it doesn't hurt the experience.
- **Book-a-call popup.** It opens once per session on the first of: 25 s on the page, the visitor reaching the offer section, or exit intent on desktop.
  - Copy: "Like it? Get this live on your site. Book a 15-minute call and we'll build your real version." Primary button: "Book my call". Secondary: "Keep exploring".
  - Dismissible, with Escape working. Respect `prefers-reduced-motion`.
  - Never show it while the shop detail panel or cart is open.
- **Floating "Book a call" pill.** It stays visible after the popup is dismissed. On mobile it sits above the buy bar so the two never overlap.
- **Footer credit and a "Report this demo" link,** as before.

**On the progress page:** a "Book a call while you wait" link under the progress bar. On completion, the demo opens in a reveal modal with three buttons: "Open full demo", "Book a call to make it live" and "Copy link".

**Lead capture.** Collect the email on the form, and send the "your demo is ready" link email through a free tier (Resend or Cloudflare Email Routing; pick one, and tell me the setup), so people who leave during the build still come back.

## 1c. Landing page showcase (3 preset businesses)
- **Three preset demos,** generated by the real pipeline and pinned so they never expire (`preset: true` in D1): **Culture Pop** (drinks/can), **Bubble** (skincare) and one more from a different category with a different shape. I suggest **Fly By Jing** (chili crisp jar); if their robots.txt blocks us, use another brand from my list.
- **Autoplay "how it works" sequence** above the fold, on a loop and built in React (not a video, for speed):
  1. A URL types itself into the form (one of the 3 presets, rotating each loop).
  2. "Build my demo" gets pressed.
  3. The real progress UI runs on a fast timeline, with the stage labels, live details and ETA from section 1d.
  4. The finished demo pops up in a phone/laptop frame, showing a poster image of that preset's real demo.
- Pause it on hover/focus. With reduced motion, show the static end state.
- Each preset has a "See it live" button that opens `/d/<preset-slug>`. These links are instant because nothing is generated.
- The real form sits directly below (or beside, on desktop) with its own headline: "Your turn. Paste your website."
- **Performance:** the landing page must not load three.js. Use poster images (WebP, generated with Playwright during build/deploy) for the frames. The 3D only loads on `/d/*`.

## 1d. Progress bar and time estimate (keep people watching)
- **Real stage progress, plus estimated progress within each stage.**
  - Each stage has a weight and an expected duration. Seed defaults: intake 2 s, collect 15 s, brief 25 s, config 20 s, verify 8 s, publish 3 s. After that, use a **rolling median of the last 50 successful runs** per stage, stored in D1.
  - Bar value = finished stage weights + the current stage's weight × min(elapsed / expected, 0.9).
  - The bar **never moves backwards**. Animate it smoothly between polls.
  - If a stage runs past its estimate, hold it at 90% of that stage and change the label to "Taking a little longer than usual, almost there".
- **ETA text:** "About 45 seconds left", rounded to 5 s, recalculated every second, and never shown as 0 until the run is done.
- **Live details from each stage's outputs,** so there's always something new to look at:
  - after collect: "Found 12 pages, 7 products", plus the brand's color swatches and logo appearing
  - after brief: product names popping in as chips, plus the 4 buying objections we'll answer
  - after config: "Picked fonts: X + Y"
  - after verify: "Checked 18 claims against your site"
  - Each stage writes a small `progress.json` (`{label, details[], swatches[], products[]}`) next to its output, and the progress API returns it.
- **Transport:** poll `GET /api/runs/:id` every 1 s, or use server-sent events if they stay inside the Free plan limits. Cache the response at the edge for 1 s.
- **If they leave:** show "We'll also email you the link", so leaving isn't a loss.
- **Failure:** if a stage fails after its retries, show a friendly message, offer "Upload product images instead", and still offer "Book a call". Never show a blank screen or raw errors.
- **Manual review:** public runs default to auto-publish. A run goes to manual review only if verify drops more than 30% of the claims, or the domain is on a watch list. When that happens, show: "We're giving your demo a quick human check. You'll get an email within 24 hours."

## 2. Ground rules
- **Performance and cost first.** Stay inside the Cloudflare Workers Free plan: Workers, Static Assets, Workflows, R2, D1, Turnstile, Browser Run (10 min/day), Access. Workflows on Free allows 10 ms CPU per step invocation, so keep parsing lean. If we hit CPU limits, tell me before suggesting Workers Paid.
- **AI costs.** The model API is pay-as-you-go, not a subscription.
  - Make the provider an adapter: Anthropic API by default, Workers AI (free daily allocation) as the fallback.
  - Model IDs go in env vars, so I can swap them. Use a stronger model for the brief and config stages and a cheaper one for verification. Confirm the current model IDs and prices in the Anthropic docs; don't guess them.
  - Log tokens per stage and enforce a daily spend cap (env var). When the cap is hit, queue runs for the next day.
- **No fabrication, ever.**
  - Every claim, price, ingredient and retailer on a demo must trace back to text we scraped (keep the source URL plus a quote). Anything that doesn't trace back gets dropped.
  - Reviews and ratings are never generated. They stay labeled placeholders unless the business provides real ones.
  - Offers we invent are tagged "Demo offer" on the page.
- **No impersonation.** Demos are clearly labeled concepts, unlisted, noindex, and expiring. They never collect payments or customer data for the brand. Checkout and store links go to the brand's real site. Add a "Report this demo" link that unpublishes it pending my review.
- **Scraping etiquette and safety.**
  - Respect robots.txt and send an honest User-Agent (`tycodes-demo-bot/1.0 (+https://tycodes.app/bot)`).
  - Fetch at most 8 pages from the same domain, with a 10 s timeout and 2 MB max per response.
  - SSRF guard: http(s) only; block private, loopback and link-local IPs and non-standard ports.
  - **Do not scrape Instagram** (login wall and terms of service). Store the IG link as metadata, and ask for uploaded images instead.
  - Proxy and re-host any image we use into R2, after checking its content type and size. Never hotlink.
- **Writing style for all generated copy:** plain, no em dashes, doesn't sound AI-written, short sentences, the brand's own words wherever possible.

## 3. ICM in one page (how this project uses it)
- **One stage, one job.** Numbered folders are the stages. Each stage reads defined inputs and writes to its own `output/`.
- **Plain text is the interface.** Stages talk only through markdown and JSON files.
- **Five context layers:**
  - L0 `CLAUDE.md` (where am I)
  - L1 workspace `CONTEXT.md` (routing)
  - L2 stage `CONTEXT.md` (the contract: Inputs / Process / Outputs)
  - L3 reference material, stable across runs: `_config/`, `shared/`, stage `references/` ("the factory")
  - L4 working artifacts: this run's files ("the product")
- **The L2 Inputs table is the control point.** It lists exactly which L3 and L4 files a stage loads. The code must parse this table and load only those files, so editing the markdown really changes what the model sees.
- **Every output is an edit surface.** A human can edit any stage output, and the next stage reads whatever is there.
- **Configure the factory, not the product.** We never generate code per demo. One prebuilt template renders any `brand.config.json`.

**Same workspace in two places:**
- **Locally**, as a folder I can run with Claude Code or the CLI: `npm run pipeline -- --url https://brand.com` writes `runs/<id>/stages/...` on disk.
- **In the cloud**: the Worker bundles the same `workspace/` markdown (import `.md` as text), and each run's L4 files live in R2 at `runs/<id>/<stage>/output/...`.

One source of truth: the stage contracts in `workspace/`.

## 4. Repo layout
```
demo-generator/
  BUILD_PROMPT.md            (this file)
  docs/icm-paper.pdf
  workspace/                 ICM workspace = the pipeline definition
    CLAUDE.md                L0: identity, folder map, rules summary (~800 tokens max)
    CONTEXT.md               L1: routing, stage list, shared resources (~300 tokens)
    _config/                 L3: playbook.md, voice.md, honesty-rules.md, config-schema.json,
                             shape-catalog.md, font-pairs.md, objection-framework.md
    shared/examples/         L3: bubble.config.json, culture-pop.config.json (known-good configs)
    stages/
      01_intake/   CONTEXT.md  scripts/  output/
      02_collect/  CONTEXT.md  scripts/  output/
      03_brief/    CONTEXT.md  references/  output/
      04_config/   CONTEXT.md  references/  output/
      05_verify/   CONTEXT.md  scripts/  references/  output/
      06_publish/  CONTEXT.md  scripts/  output/
    setup/questionnaire.md   how to configure the factory for a new niche
  pipeline/                  shared TS: contract parser, stage runner, model adapter, scripts
  cli/                       local runner (Node) that uses pipeline/ with a filesystem store
  worker/                    Cloudflare Worker: API routes, Workflow class, R2/D1 store, admin
  web/                       generator site (form, progress, admin UI), Vite + React
  template/                  demo renderer = Bubble v2 refactored to load config at runtime
  wrangler.jsonc
```
- **Store interface.** `pipeline/` talks to storage through an interface (`read(path)`, `write(path)`, `list(prefix)`). There are two implementations: filesystem (CLI) and R2 (Worker).
- **Stage types.** A stage is either `script` (no AI) or `agent` (model call), as declared in its CONTEXT.md front matter.

## 5. Stage contracts (write each as `stages/NN_name/CONTEXT.md`)
Use the paper's format: `## Inputs` (each line tagged Layer 3 or Layer 4 with a path), `## Process`, `## Outputs`, plus front matter with `type`, `model` (agent stages) and `gate: auto|review`.

**01_intake** (script)
- **Inputs:** the form payload.
- **Process:**
  - Normalize the URL, then run the SSRF check and the robots.txt check.
  - Dedupe: the same domain within 7 days returns the existing demo.
  - Save uploads to the run folder.
- **Outputs:** `input.json` (url, igUrl, images[{path, kind: label|photo}], email, ownerClaim).

**02_collect** (script)
- **Inputs:** `input.json`.
- **Process:**
  - Fetch the homepage, then follow same-domain links likely to be products, about, ingredients, shop or FAQ (8 pages max). Use HTMLRewriter for text.
  - Pull: title/meta/og tags, JSON-LD `Product`/`Organization`/`Offer`, a Shopify `/products.json` probe (public on most Shopify stores), `<meta name="theme-color">`, CSS custom properties, the logo URL, and product image URLs.
  - Use Browser Run only if the HTML text is under ~500 characters (JS-rendered site).
- **Outputs:**
  - `site.md`: clean text grouped by page, with each page's URL as a heading. This is the evidence file.
  - `products.raw.json`
  - `signals.json`: colors, fonts, logo, images
  - `images/`: re-hosted, at most 8

**03_brief** (agent, stronger model, `gate: review` when `REVIEW_MODE=manual`)
- **Inputs:**
  - L4: `02_collect/output/site.md`, `products.raw.json`, `signals.json`, `01_intake/output/input.json`
  - L3: `_config/playbook.md`, `_config/objection-framework.md`, `_config/voice.md`, `_config/honesty-rules.md`, `_config/shape-catalog.md`
- **Process:** write the brand brief:
  - category and price tier
  - 3 to 5 hero products: name, type, size, price (only if found), shape from the catalog, colors
  - 4 objection beats in the playbook format, each backed by claims with `{claim, quote, sourceUrl}`
  - retailers found, voice notes, palette, and a font pair from `font-pairs.md`
  - When unsure, write "unknown". Never fill gaps with guesses.
- **Outputs:** `brief.md`, with an `evidence` section and every claim quoted.

**04_config** (agent, stronger model)
- **Inputs:**
  - L4: `03_brief/output/brief.md`, `02_collect/output/signals.json`
  - L3: `_config/config-schema.json`, `shared/examples/*.json`, `_config/voice.md`
- **Process:**
  - Produce a `brand.config.json` that matches the schema. Use the model's structured JSON output.
  - Validate with zod in code. On failure, retry once with the validation errors appended.
  - Uploaded "label" images become `product.label`; "photo" images use the `photo` shape.
- **Outputs:** `brand.config.json`, `config-notes.md` (the choices made and why).

**05_verify** (script first, then the cheaper model only for flagged items)
- **Inputs:**
  - L4: `04_config/output/brand.config.json`, `03_brief/output/brief.md`, `02_collect/output/site.md`
  - L3: `_config/honesty-rules.md`
- **Process:**
  - **Script checks:**
    - the schema
    - every claim, price and retailer string fuzzy-matches text in `site.md`
    - `reviews` is empty unless supplied, and invented offers have `isDemo: true`
    - the credit line is present
    - text and background color contrast is at least 4.5:1, auto-adjusting if not
    - no em dashes
  - **Model check** (only for strings the script flags): "Is this claim directly supported by this quote? yes/no + why". Drop anything that isn't.
- **Outputs:** `brand.config.final.json`, `verify-report.md` (what was dropped and why).

**06_publish** (script)
- **Inputs:** `05_verify/output/brand.config.final.json`, the run's images.
- **Process:**
  - Write `demos/<slug>/config.json` and assets to R2, and set D1 status to `ready` with an expiry date.
  - The slug is the brand name plus 4 random characters.
- **Outputs:** `publish.json` (url, expiresAt).

**Run manifest.** Each run also writes `runs/<id>/manifest.json` with stage status, timings, tokens in/out and model per stage. That's the "inspect intermediate state" view in admin.

## 6. Stage runner (pipeline/)
- `parseContract(md)`: reads front matter and the Inputs/Outputs sections into structured data. Write unit tests for it.
- **Agent stages:** assemble the prompt in this order, each block labeled:
  1. L0
  2. L1
  3. L2
  4. `REFERENCE (internalize as constraints)`: the L3 files
  5. `WORKING INPUT (process this)`: the L4 files

  Then call the model and write the files listed under Outputs. Keep the total context under ~10k tokens per stage; if an input is larger, the previous stage must condense it.
- **Script stages:** run `stages/NN/scripts/*.ts`.
- **Re-runs.** "Re-run from stage N" re-executes stage N and everything after it, reading whatever is currently in earlier outputs, including my edits.
- **Cloud orchestration.** One Cloudflare Workflow class `DemoPipeline`, with one `step.do()` per stage so each stage gets retries. For `gate: review` stages in manual mode, pause with `step.waitForEvent` (or, if that's unavailable, persist state and resume from an admin "approve" call).

## 7. Template (template/)
- Copy `../cosmetics/bubble`, then:
  - Load config at runtime from `/api/demos/<slug>` instead of importing it.
  - Show a branded skeleton while it loads. Keep static-first loading.
- **Shapes:**
  - Port the can from Culture Pop into `shapes.js`.
  - Add `tub` (supplements) and `photo` (a product photo on a rounded slab with slight thickness and a soft shadow, for anything that isn't a standard package).
  - `shape-catalog.md` maps categories to shapes.
- **Fonts:** load the brand's font pair from `font-pairs.md` (a curated list of about 8 Google Font pairings).
- **Analytics.** Keep `track()`, and add a sender that batches events to `POST /api/events` (stored in D1, sampled if volume grows) so each demo shows real numbers in admin.
- **Build once:** the Worker serves the same static bundle for every `/d/*` route.
- Add the demo warning bar, the book-a-call popup and the floating pill from section 1b as template components, driven by config and env (brand name, `BOOKING_URL`).
- Keep everything from the PLAYBOOK:
  - objection beats, sticky buy bar, Skip to shop
  - left-to-right shop, routine/pack builder
  - offer ending, static fallback for low-end/reduced motion, `?debug=1`, `?ab=1`

## 8. Worker, data, safety
- **Routes:**
  - `POST /api/runs` (Turnstile-verified, rate limited)
  - `GET /api/runs/:id`: progress with stage, percent, etaSeconds and the latest `progress.json`
  - `GET /api/presets`
  - `GET /api/demos/:slug`
  - `GET /api/assets/*`
  - `POST /api/events`
  - `POST /api/report/:slug`
  - `/admin/*`: protected by Access; also verify the Access JWT in the Worker
- **D1 tables:** `runs` (id, domain, status, stage, slug, email, owner_claim, preset, created_at, expires_at, tokens, cost_estimate), `stage_timings` (stage, ms, created_at; for the ETA medians), `leads`, `events` (slug, name, props_json, ts), `reports`.
- **Abuse:**
  - Turnstile.
  - Workers rate limiting binding: 3 runs per IP per day.
  - A global daily cap (env var).
  - Domain dedupe.
  - A blocklist file for domains I never want demoed.
  - A cron trigger that unpublishes expired demos.
- **Privacy:** store only what's needed. Keep email for leads; never put the IP in the database (use a hashed IP for rate limiting). Add a short privacy and terms page.

## 9. Things to ask me for (when you reach them)
- the Cloudflare account and the tycodes.app zone (the app goes on the root domain)
- my `BOOKING_URL` (Cal.com or Calendly)
- the email sender choice (Resend free tier or Cloudflare Email Routing)
- Turnstile site and secret keys
- an Anthropic API key, stored with `wrangler secret put` and never committed
- the Access policy email
- the review mode default (`auto` or `manual`)
- the daily caps

## 10. Phases (stop after each one)

**Phase 1: ICM workspace + local CLI.**
- Set up the repo locally (`git init`, `.gitignore` per section 0b, secret-scan hook). Don't create the GitHub repo until I approve this phase.
- Write every file in `workspace/` (contracts and L3 references, filled from PLAYBOOK and the Culture Pop config; use the Bubble config only as an unverified example) and `pipeline/` + `cli/`, with a filesystem store.
- Run it on `https://hellobubble.com` and `https://culturepopsoda.com`. Show me each stage's output folder, and compare the generated Culture Pop `brand.config.json` with the hand-built one in `../drink brands/culture-pop/src/brand.config.js`.
- The Culture Pop site blocked an automated fetch during my research, so robots.txt may block it. If it does, that's the test of the fallback: the run should stop with a clear message asking for uploads and pasted product info, not scrape anyway.
- **Done when:** I can open any stage output, edit it, re-run from that stage, and see my edit carried through.

**Phase 2: Template v3.**
- First, install and run `../cosmetics/bubble` as-is, test it on desktop and mobile, and list and fix its bugs. Then build the template from it.
- Do the runtime config, can/tub/photo shapes, font pairs and events sender.
- Render the Phase 1 configs locally on desktop and mobile, plus `?variant=static`.
- **Done when:**
  - both configs render with no code changes
  - the Lighthouse mobile performance score is 85 or higher on the static variant
  - the generated Culture Pop looks about as good as the hand-built one; show me them side by side

**Phase 3: Cloudflare pipeline.**
- Build the Worker, Workflow, R2/D1 store, public form, progress page and `/d/:slug` route, all using the same `workspace/` files.
- Build the progress bar, ETA and live details (section 1d), and the reveal modal.
- Generate the 3 presets (Culture Pop, Bubble, and the third brand) through the deployed pipeline, then pin them.
- Deploy to a `*.workers.dev` preview.
- **Done when:**
  - a URL submitted on the preview becomes a live demo
  - the run's folder in R2 mirrors the local layout
  - the ETA lands within ±30% of the real time after 10 test runs

**Phase 4: Conversion, showcase, safety, admin, analytics.**
- Build the demo warning bar, book-a-call popup and floating pill (1b), the ready email, and the landing page with the 3 pinned presets and the autoplay how-it-works sequence (1c).
- Add Turnstile, rate limits, caps, robots/SSRF guards, the report flow, expiry cron, the Access-protected admin (edit outputs, re-run from N, approve, leads CSV, per-demo analytics) and manual review mode.
- **Done when:**
  - I can review a run in manual mode, fix a claim in `brief.md`, approve it, and see the fix on the demo
  - admin shows booking clicks per demo
  - the landing page scores 90 or higher on Lighthouse mobile performance

**Phase 5: Launch.**
- Put the app on `https://tycodes.app/` (custom domain on the Worker, root plus `www` redirect), test with 5 brands across different categories (drinks, skincare, sauce, coffee, supplements), and tune the prompts in the L3 files, not in code.
- Write `workspace/setup/questionnaire.md` so I can configure the factory for a new niche.
- **Done when:** all 5 publish with zero unsupported claims in their verify reports, and you give me a one-page `RUNBOOK.md` (deploy, rotate keys, raise caps, add a shape, edit a stage).
