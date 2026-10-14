# tycodes demo generator

Turns a business website into a shoppable 3D scroll demo. Read `BUILD_PROMPT.md` for the full brief and `README.md` for layout.

- `workspace/` is the ICM pipeline definition (stage contracts and L3 rules). Tune prompts there, not in code.
- `pipeline/` + `cli/` run it locally: `npm run pipeline -- --url https://brand.com`. Runs land in `runs/<id>/` (gitignored).
- `template/` renders any published config: `cd template && npm run dev`, then `/d/<slug>`.
- Tests: `npm test`. Types: `npx tsc --noEmit -p .`. After editing `font-pairs.md` or the zod schema: `npm run schema`.

## Answering pending pipeline requests (manual model mode)
With `MODEL_PROVIDER=manual` in `.env`, agent stages don't call the API. They write
`runs/<id>/stages/<stage>/manual/<key>.request.md` and stop. When asked to "answer the pending pipeline requests":
1. Find `*.request.md` files under `runs/` that have no matching `<key>.response.md`.
2. For each one, read it fully and do exactly what it asks, as the model would. The SYSTEM part holds the rules and
   references, the USER part holds the working input. Follow the honesty rules: quote only text that is in the input.
3. Write only the answer to `<key>.response.md` (same folder, same key). For JSON requests, write the bare JSON object.
4. Tell the user to re-run the command printed by the pipeline (`--run <id> --from <stage>`).
Don't edit the request files, and don't change anything outside the response files.
