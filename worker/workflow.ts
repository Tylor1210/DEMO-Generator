// One Workflow instance per run. One step per stage, so each stage gets its own retries,
// and a finished stage never re-runs when a later one fails.
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { STAGES, loadContract, readManifest, runStage, writeManifest, stagePath } from '../pipeline/runner.ts'
import { CapReached, StageBlocked } from '../pipeline/types.ts'
import { deps, type Env } from './env.ts'

type Params = { runId: string; from?: string }
type StepResult = { ok?: true; blocked?: string; capped?: string; review?: string }

const nextUtcMidnight = () => { const d = new Date(); d.setUTCHours(24, 5, 0, 0); return d }

export class DemoPipeline extends WorkflowEntrypoint<Env, Params> {
  async run(event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep) {
    const { runId, from } = event.payload
    const env = this.env
    const d = deps(env)
    const fromIdx = from ? Math.max(0, STAGES.indexOf(from as any)) : 0
    const setRun = (fields: Record<string, unknown>) => {
      const keys = Object.keys(fields)
      return env.DB.prepare(`UPDATE runs SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(fields), runId).run()
    }

    // Re-running from N resets N and everything after it.
    await step.do('reset', async () => {
      const m = (await readManifest(d.store, runId))!
      for (const s of STAGES.slice(fromIdx)) m.stages[s] = { status: 'pending' }
      m.status = 'running'; m.message = undefined
      await writeManifest(d.store, m)
      await setRun({ status: 'running', message: null })
      return true
    })

    for (const stage of STAGES.slice(fromIdx)) {
      let result!: StepResult
      for (let attempt = 0; ; attempt++) {
        try {
          result = await step.do(attempt ? `${stage} #${attempt + 1}` : stage,
            // Collect waits out storefront rate limits: 30 s, 60 s, 120 s, 240 s. Other stages retry quickly.
            stage === '02_collect'
              ? { retries: { limit: 4, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes' }
              : { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
            async (): Promise<StepResult> => {
              await setRun({ stage })
              try { await runStage(d, runId, stage) } catch (e) {
                if (e instanceof StageBlocked) return { blocked: e.message }
                if (e instanceof CapReached) return { capped: e.message }
                // Contract and schema problems won't fix themselves on retry.
                if (/not in its (Inputs|Outputs) table|Contract|schema/i.test(String((e as Error).message))) throw new NonRetryableError((e as Error).message)
                throw e
              }
              const m = (await readManifest(d.store, runId))!
              const st = m.stages[stage]
              await env.DB.prepare('INSERT INTO stage_timings (stage, ms, created_at) VALUES (?, ?, ?)').bind(stage, st.ms ?? 0, Date.now()).run()
              const cost = Object.values(m.stages).reduce((a, s) => a + (s.costUsd ?? 0), 0)
              const tokens = Object.values(m.stages).reduce((a, s) => a + (s.tokensIn ?? 0) + (s.tokensOut ?? 0), 0)
              await setRun({ cost_estimate: cost, tokens })
              return m.message?.startsWith('review:') ? { review: m.message } : { ok: true }
            })
        } catch (e) {
          // Retries exhausted: record a friendly failure. The build page offers uploads and a call.
          const limited = /rate limited/.test(String((e as Error).message))
          await step.do(`fail ${stage}`, async () => {
            const m = (await readManifest(d.store, runId))!
            m.status = limited ? 'blocked' : 'failed'
            m.message = limited
              ? 'Your site is busy right now and asked us to slow down. Try again in a few minutes, or paste your product info and add product photos and we’ll build from those.'
              : `We hit a problem at "${stage}". ${String((e as Error).message).slice(0, 200)}`
            await writeManifest(d.store, m)
            await setRun({ status: m.status, message: m.message })
            return true
          })
          return { status: limited ? 'blocked' : 'failed' }
        }
        if (result.capped) {
          await step.do(`queued ${stage} #${attempt + 1}`, async () => { await setRun({ status: 'queued', message: result.capped }); return true })
          await step.sleepUntil(`wait for spend cap reset ${attempt + 1}`, nextUtcMidnight())
          continue
        }
        break
      }

      if (result.blocked) {
        await step.do(`blocked ${stage}`, async () => { await setRun({ status: 'blocked', message: result.blocked }); return true })
        return { status: 'blocked' }
      }

      // Human review: a review-gated stage in manual mode, or verify dropping too much / a watched domain.
      const contract = await loadContract(d.workspace, stage)
      const gated = (contract.gate === 'review' && d.env.REVIEW_MODE === 'manual') || !!result.review
      if (gated && stage !== STAGES[STAGES.length - 1]) {
        await step.do(`review ${stage}`, async () => {
          const m = (await readManifest(d.store, runId))!
          m.stages[stage].status = 'review'; m.status = 'review'
          m.message = result.review ?? `review: check ${stage}/output and approve to continue`
          await writeManifest(d.store, m)
          await setRun({ status: 'review', message: m.message })
          return true
        })
        await step.waitForEvent(`approval after ${stage}`, { type: 'approve', timeout: '7 days' })
        await step.do(`approved ${stage}`, async () => {
          const m = (await readManifest(d.store, runId))!
          m.stages[stage].status = 'done'; m.status = 'running'; m.message = undefined
          await writeManifest(d.store, m)
          await setRun({ status: 'running', message: null })
          return true
        })
      }
    }

    await step.do('finish', async () => {
      const raw = await d.store.read(stagePath(runId, '06_publish/output/publish.json'))
      const pub = JSON.parse(new TextDecoder().decode(raw!))
      const m = (await readManifest(d.store, runId))!
      m.status = 'done'; m.message = undefined; m.slug = pub.slug
      await writeManifest(d.store, m)
      await setRun({ status: 'done', message: null, slug: pub.slug, expires_at: Date.parse(pub.expiresAt), stage: '06_publish' })
      return true
    })
    return { status: 'done' }
  }
}
