---
stage: 05_verify
type: script
model: cheap
gate: auto
label: Checking every claim
---
# 05 Verify

Make the config honest and on-style. Code does the checks. The cheap model only judges strings the code flags.

## Inputs
| Layer | Path | Why |
|---|---|---|
| L4 | `04_config/output/brand.config.json` | The config to check |
| L4 | `03_brief/output/brief.md` | Context for flagged items |
| L4 | `02_collect/output/site.md` | The evidence |
| L4 | `01_intake/output/input.json` | Owner-supplied reviews and pasted info |
| L4 | `02_collect/output/images/` | To confirm image paths exist |
| L4 | `01_intake/output/uploads/` | To confirm upload paths exist |
| L3 | `_config/honesty-rules.md` | The rules being enforced |
| L3 | `_config/font-pairs.md` | Valid font pair ids |

## Process
1. Schema check (zod).
2. Evidence: each evidence quote must appear in `site.md` (normalized). Entries whose quote isn't there are removed.
3. Each claim chip, product note, hero sub, beat body, retailer and price must be supported: either its words fuzzy-match `site.md`, or it points at a surviving evidence entry. Prices must appear on the site as written.
4. Flagged strings go to the cheap model in one batch: "Is this text directly supported by these quotes? yes/no + why". Anything not supported is dropped (prices become null, beat bodies fall back to a quoted line).
5. Reviews must be empty unless supplied. Offers without evidence get `isDemo: true`.
6. Credit line forced to the exact text. Em and en dashes replaced.
7. Contrast: theme ink on bg and product ink on product color must reach 4.5:1. Auto-adjusted if not.
8. Font pair id must exist in `font-pairs.md`, else `clean`. Image paths must exist.
9. If more than 30% of checked items are dropped, the run goes to human review instead of publishing.

## Outputs
| Path | Why |
|---|---|
| `05_verify/output/brand.config.final.json` | The config that gets published |
| `05_verify/output/verify-report.md` | What was checked, changed and dropped, and why |
