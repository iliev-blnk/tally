// Scores each model's cached detections on a split with its tuned settings, at several strides.
//   tsx bench/score.ts [--split report] [--model ...] [--stride 1,2,3]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { MODEL_IDS, type ModelId } from '../src/detect/models'
import { loadSequences, type Split } from './datasets'
import { prepare, score, type Tuned } from './scoring'

const RESULTS = join(import.meta.dirname, 'results')
const { values } = parseArgs({
  options: {
    split: { type: 'string', default: 'report' },
    model: { type: 'string', default: MODEL_IDS.join(',') },
    stride: { type: 'string', default: '1,2,3' },
  },
})
const tuned: Tuned = JSON.parse(readFileSync(join(RESULTS, 'tuned.json'), 'utf8'))
const seqs = loadSequences(values.split as Split)
mkdirSync(RESULTS, { recursive: true })

for (const model of values.model.split(',') as ModelId[]) {
  const opts = tuned[model]
  if (!opts) throw new Error(`${model} is not tuned; run tsx bench/tune.ts`)
  if (!seqs.every((s) => existsSync(join(import.meta.dirname, '.cache', model, `${s.id}.bin`)))) {
    process.stdout.write(`${model}: detections not cached yet, skipped\n`)
    continue
  }
  const prepared = prepare(model, seqs)
  const strides = values.stride.split(',').map(Number)
  const runs = strides.map((stride) => ({ stride, ...score(prepared, { stride, ...opts }) }))
  for (const r of runs)
    process.stdout.write(
      `${model} stride ${r.stride}: WAPE ${(r.wape * 100).toFixed(1)}%  bias ${(r.bias * 100).toFixed(1)}%  ` +
        `vehicles ${(r.byGroup.vehicle.wape * 100).toFixed(1)}%  people ${(r.byGroup.person.wape * 100).toFixed(1)}%\n`,
    )
  writeFileSync(
    join(RESULTS, `accuracy-${model}.json`),
    `${JSON.stringify(
      {
        model,
        split: values.split,
        settings: opts,
        strides: runs.map(({ perSeq: _, ...r }) => r),
        perSeq: runs[0]?.perSeq,
      },
      null,
      2,
    )}\n`,
  )
}
