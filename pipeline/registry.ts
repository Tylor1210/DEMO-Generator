// Static map of stage scripts (workspace/stages/NN/scripts/*.ts). Static imports keep it bundleable for the Worker.
// tests/registry.test.ts fails if a script file exists on disk but isn't listed here.
import type { StageImpl } from './runner.ts'
import * as intake from '../workspace/stages/01_intake/scripts/intake.ts'
import * as collect from '../workspace/stages/02_collect/scripts/collect.ts'
import * as brief from '../workspace/stages/03_brief/scripts/brief.ts'
import * as config from '../workspace/stages/04_config/scripts/config.ts'
import * as verify from '../workspace/stages/05_verify/scripts/verify.ts'
import * as publish from '../workspace/stages/06_publish/scripts/publish.ts'

export const STAGE_IMPLS: Record<string, StageImpl> = {
  '01_intake': intake,
  '02_collect': collect,
  '03_brief': brief,
  '04_config': config,
  '05_verify': verify,
  '06_publish': publish,
}

export const REGISTERED_SCRIPTS = [
  '01_intake/scripts/intake.ts',
  '02_collect/scripts/collect.ts',
  '03_brief/scripts/brief.ts',
  '04_config/scripts/config.ts',
  '05_verify/scripts/verify.ts',
  '06_publish/scripts/publish.ts',
]
