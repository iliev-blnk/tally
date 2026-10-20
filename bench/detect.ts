// Runs a detector over every frame of a split in the browser and caches the raw detections.
//   tsx bench/detect.ts --split tune|report [--model yolox_nano,dfine_s] [--ep webgpu|wasm]
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { MODEL_IDS, type ModelId } from '../src/detect/models'
import type { Backend } from '../src/detect/session'
import { CACHE, frameUrl, openBench } from './browser'
import { loadSequences, type Split } from './datasets'

/** Detections are cached down to this score; scoring applies the real threshold. */
const CACHE_SCORE = 0.05

const { values } = parseArgs({
  options: {
    split: { type: 'string', default: 'tune' },
    model: { type: 'string', default: MODEL_IDS.join(',') },
    ep: { type: 'string', default: 'webgpu' },
  },
})
const seqs = loadSequences(values.split as Split)
const bench = await openBench(values.ep === 'webgpu')
try {
  for (const model of values.model.split(',') as ModelId[]) {
    const todo = seqs.filter((s) => !existsSync(join(CACHE, model, `${s.id}.bin`)))
    if (!todo.length) continue
    process.stdout.write(`${model} on ${await bench.load(model, values.ep as Backend)}\n`)
    for (const s of todo) {
      const ms = await bench.page.evaluate(
        ([frames, out, min]) => window.detectSeq(frames, out, min),
        [s.frames.map(frameUrl), `/cache/${model}/${s.id}.bin`, CACHE_SCORE] as const,
      )
      process.stdout.write(`  ${s.id} ${s.frames.length} frames, ${ms.toFixed(1)} ms/frame\n`)
    }
  }
} finally {
  await bench.close()
}
