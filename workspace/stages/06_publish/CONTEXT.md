---
stage: 06_publish
type: script
gate: auto
label: Publishing your demo
---
# 06 Publish

Put the verified config and its images where the template can load them. No model call.

## Inputs
| Layer | Path | Why |
|---|---|---|
| L4 | `05_verify/output/brand.config.final.json` | The config to publish |
| L4 | `02_collect/output/images/` | Re-hosted site images |
| L4 | `01_intake/output/uploads/` | Owner uploads |

## Process
1. Slug = brand name slug plus 4 random characters (`culture-pop-x7k2`). A re-publish of the same run keeps its slug.
2. Copy every image the config references to `demos/<slug>/assets/` and rewrite the paths to `assets/<file>`.
3. Write `demos/<slug>/config.json` and `demos/<slug>/meta.json` (`{runId, status: ready, createdAt, expiresAt}`). Expiry is `DEMO_TTL_DAYS` (default 30).
4. In the Worker, also set the D1 row to `ready` with the expiry date.

## Outputs
| Path | Why |
|---|---|
| `06_publish/output/publish.json` | `{slug, url, expiresAt}` |
