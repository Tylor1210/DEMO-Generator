---
stage: 01_intake
type: script
gate: auto
label: Checking your link
---
# 01 Intake

Turn the form payload into a clean, safe `input.json`. No model call.

## Inputs
| Layer | Path | Why |
|---|---|---|
| L4 | `01_intake/input/payload.json` | The form: url, igUrl, email, ownerClaim, images, pasted text |
| L4 | `01_intake/input/uploads/` | Files the visitor uploaded |
| L3 | `_config/blocklist.txt` | Domains never to demo |

## Process
1. Normalize the URL: add `https://` if missing, lowercase the host, drop the hash and tracking params.
2. Safety: http(s) only, standard ports, public IPs only (resolve DNS and block private, loopback and link-local ranges).
3. Refuse blocklisted domains.
4. Fetch the homepage headers. If it redirects to a different domain, stop and ask the visitor to confirm their real site (parked domains redirect to marketplaces).
5. Check robots.txt for `tycodes-demo-bot` and `*`. If the homepage is disallowed, mark `robotsBlocked: true`. Stage 02 then needs uploads or pasted info.
6. Dedupe: if the same domain has a published demo from the last 7 days, return it (the CLI can force a new run).
7. Copy uploads into `output/uploads/` (images only, max 4, max 5 MB each), each tagged `label` or `photo`.
8. Instagram is stored as a link only. It is never scraped.

## Outputs
| Path | Why |
|---|---|
| `01_intake/output/input.json` | `{url, domain, igUrl, images[{path, kind}], email, ownerClaim, pasted, robotsBlocked, dedupeOf}` |
| `01_intake/output/uploads/` | Re-saved uploads |
