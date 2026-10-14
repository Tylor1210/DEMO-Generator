# Routing (L1)

| Stage | Type | Job | Main output |
|---|---|---|---|
| 01_intake | script | Normalize URL, safety checks, save uploads | input.json |
| 02_collect | script | Read the site, keep evidence | site.md, signals.json |
| 03_brief | agent (strong) | Write the brand brief with quoted evidence | brief.md |
| 04_config | agent (mid) | Turn the brief into a brand config | brand.config.json |
| 05_verify | script + cheap model | Drop anything that doesn't trace to the site | brand.config.final.json |
| 06_publish | script | Write the demo and its assets | publish.json |

Stages run in order. Re-running from stage N reads whatever is in earlier outputs, including human edits.

Shared resources (L3): `_config/` holds rules, voice, the config schema, the shape catalog, font pairs and the objection framework. `shared/examples/` holds known-good configs to copy structure from, not facts.
