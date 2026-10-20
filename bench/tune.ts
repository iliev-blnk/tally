// Grid-searches the score threshold and tracker settings per model on the tune split only.
//   tsx bench/tune.ts [--model yolox_nano,...]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { MODEL_IDS, type ModelId } from '../src/detect/models'
import { loadSequences } from './datasets'
import { prepare, score, type Tuned } from './scoring'

const OUT = join(import.meta.dirname, 'results/tuned.json')
const { values } = parseArgs({
  options: { model: { type: 'string', default: MODEL_IDS.join(',') } },
})

const tuned: Tuned = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
const seqs = loadSequences('tune')
for (const model of values.model.split(',') as ModelId[]) {
  const prepared = prepare(model, seqs)
  let best: Tuned[string] | null = null
  // 0.05 is the floor: detections are cached at that score.
  for (const minScore of [0.05, 0.1, 0.2, 0.3, 0.4])
    for (const high of [0.4, 0.5, 0.6, 0.7])
      for (const buffer of [15, 30]) {
        const opts = { minScore, tracker: { high, newScore: high + 0.1, buffer } }
        const s = score(prepared, { stride: 1, ...opts })
        if (!best || s.wape < best.wape) best = { ...opts, wape: s.wape }
      }
  if (!best) continue
  tuned[model] = best
  process.stdout.write(`${model} ${JSON.stringify(best)}\n`)
}
mkdirSync(join(import.meta.dirname, 'results'), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(tuned, null, 2)}\n`)
