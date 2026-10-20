// Per-frame detector latency for each model on one device: 20 warm-up frames, then 200 timed.
// Latency is preprocessing + inference + decoding of an already decoded 960×540 frame.
//   tsx bench/speed.ts --device rtx3050|irisxe|cpu
import { mkdirSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { MODEL_IDS, type ModelId } from '../src/detect/models'
import type { Backend } from '../src/detect/session'
import { frameUrl, openBench } from './browser'
import { loadSequences } from './datasets'

const DEVICES: Record<string, { ep: Backend; power?: GPUPowerPreference; expect?: RegExp }> = {
  rtx3050: { ep: 'webgpu', power: 'high-performance', expect: /nvidia/i },
  irisxe: { ep: 'webgpu', power: 'low-power', expect: /intel/i },
  cpu: { ep: 'wasm' },
}
const WARMUP = 20
const TIMED = 200

export type SpeedResult = {
  device: string
  adapter: string
  browser: string
  cpu: string
  /** Set when the device could not be reached; no models were timed. */
  unavailable?: string
  models: Partial<Record<ModelId, { p50: number; p90: number; fps: number }>>
}

const { values } = parseArgs({
  options: {
    device: { type: 'string', default: 'rtx3050' },
    model: { type: 'string', default: MODEL_IDS.join(',') },
  },
})
const device = DEVICES[values.device]
if (!device) throw new Error(`unknown device ${values.device}`)
const seq = loadSequences('report').find((s) => s.frames.length >= WARMUP + TIMED)
if (!seq) throw new Error('no report sequence is long enough')
const frames = seq.frames.slice(0, WARMUP + TIMED).map(frameUrl)

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] as number
}
const round = (x: number) => Math.round(x * 10) / 10

const bench = await openBench(device.ep === 'webgpu')
const out: SpeedResult = {
  device: values.device,
  adapter: '',
  browser: bench.browserVersion,
  cpu: `${cpus()[0]?.model.trim()} (${cpus().length} threads)`,
  models: {},
}
try {
  for (const model of values.model.split(',') as ModelId[]) {
    out.adapter = await bench.load(model, device.ep, device.power)
    if (device.expect && !device.expect.test(out.adapter)) {
      out.unavailable = `the browser gave ${out.adapter} for ${device.power}`
      break
    }
    const ms = await bench.page.evaluate((f) => window.speed(f), frames)
    const timed = ms.slice(WARMUP)
    const p50 = quantile(timed, 0.5)
    out.models[model] = {
      p50: round(p50),
      p90: round(quantile(timed, 0.9)),
      fps: round(1000 / p50),
    }
    process.stdout.write(`${model} on ${out.adapter}: ${JSON.stringify(out.models[model])}\n`)
  }
} finally {
  await bench.close()
}
if (out.unavailable) process.stdout.write(`${values.device}: ${out.unavailable}\n`)
mkdirSync(join(import.meta.dirname, 'results'), { recursive: true })
writeFileSync(
  join(import.meta.dirname, `results/speed-${values.device}.json`),
  `${JSON.stringify(out, null, 2)}\n`,
)
