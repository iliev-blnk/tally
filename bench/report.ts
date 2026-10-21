// Writes the benchmark tables into README.md between the <!-- accuracy --> and <!-- speed -->
// markers, from bench/results, and prints the defaults the numbers pick.
//   tsx bench/report.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_IDS, MODELS } from '../src/detect/models'
import { type Accuracy, pickDefaults } from './pick'
import type { SpeedResult } from './speed'

const RESULTS = join(import.meta.dirname, 'results')
const README = join(import.meta.dirname, '../README.md')
const read = <T>(name: string): T => JSON.parse(readFileSync(join(RESULTS, `${name}.json`), 'utf8'))

type Stride = {
  stride: number
  wape: number
  bias: number
  truth: number
  byGroup: Record<'vehicle' | 'person', { wape: number }>
}
type Full = Omit<Accuracy, 'strides'> & { strides: Stride[] }

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(1)}%`
const table = (head: string[], rows: string[][]) =>
  [head, head.map((_, i) => (i ? '---:' : '---')), ...rows]
    .map((r) => `| ${r.join(' | ')} |`)
    .join('\n')

const acc = MODEL_IDS.map((m) => read<Full>(`accuracy-${m}`))
const at = (a: Full, stride: number): Stride | undefined =>
  a.strides.find((s) => s.stride === stride)
const truth = at(acc[0] as Full, 1)?.truth ?? 0
const accuracy = [
  table(
    ['model', 'every frame', 'every 2nd', 'every 3rd', 'bias', 'vehicles', 'people'],
    acc.map((a) => {
      const s1 = at(a, 1)
      return [
        MODELS[a.model].name,
        ...[1, 2, 3].map((k) => {
          const s = at(a, k)
          return s ? pct(s.wape) : '–'
        }),
        s1 ? signed(s1.bias) : '–',
        s1 ? pct(s1.byGroup.vehicle.wape) : '–',
        s1 ? pct(s1.byGroup.person.wape) : '–',
      ]
    }),
  ),
  '',
  `WAPE of line counts against the labels, over ${truth.toLocaleString('en')} labelled crossings ` +
    'in 40 UA-DETRAC test sequences and MOT17-02 and -04. Lower is better; bias is the signed ' +
    'total error (negative: undercounts). "Every 2nd" and "every 3rd" analyse only those frames, ' +
    'as a device that runs at a half or a third of the video frame rate would.',
].join('\n')

const devices = ['rtx3050', 'irisxe', 'cpu'].filter((d) =>
  existsSync(join(RESULTS, `speed-${d}.json`)),
)
const speeds = devices.map((d) => read<SpeedResult>(`speed-${d}`))
const measured = speeds.filter((s) => !s.unavailable)
const name = (s: SpeedResult) =>
  s.device === 'cpu'
    ? `CPU, WASM: ${s.cpu
        .replace(/\(R\)|\(TM\)|CPU|@.*?(?= \()/g, '')
        .replace(/\s+/g, ' ')
        .replace(/ \((\d+) threads\)$/, ', $1 threads')
        .trim()}`
    : s.device === 'rtx3050'
      ? 'RTX 3050 Laptop, WebGPU'
      : 'Iris Xe, WebGPU'
const speed = [
  table(
    ['model', ...measured.map(name)],
    MODEL_IDS.map((m) => [
      MODELS[m].name,
      ...measured.map((s) => {
        const r = s.models[m]
        return r ? `${r.p50} ms · ${r.fps} fps` : '–'
      }),
    ]),
  ),
  '',
  'Median time per frame for preprocessing, inference and decoding, over 200 frames after 20 ' +
    `warm-up frames, in Chromium ${speeds[0]?.browser ?? ''}.` +
    speeds
      .filter((s) => s.unavailable)
      .map((s) => ` ${name(s)} was not measured: ${s.unavailable}.`)
      .join(''),
].join('\n')

const gpu = speeds.find((s) => s.device === 'rtx3050')
const cpu = speeds.find((s) => s.device === 'cpu')
const picked = gpu && cpu ? pickDefaults(acc, gpu, cpu) : null
const defaults = picked
  ? `The page picks its model from these numbers: ${MODELS[picked.gpu].name} on WebGPU, the most ` +
    'accurate model that holds 20 fps on the RTX 3050, and ' +
    `${MODELS[picked.cpu].name} on WASM, the most accurate that holds 8 fps on the CPU (or the ` +
    'fastest, if none does). `?model=` overrides it.'
  : ''

let readme = readFileSync(README, 'utf8')
for (const [mark, body] of [
  ['accuracy', accuracy],
  ['speed', speed],
  ['defaults', defaults],
] as const) {
  // The block may be empty (first run) or hold the previous tables.
  const re = new RegExp(`(<!-- ${mark} -->\\n)[\\s\\S]*?(<!-- /${mark} -->)`)
  if (!re.test(readme)) throw new Error(`README has no ${mark} markers`)
  readme = readme.replace(re, (_, open: string, close: string) => `${open}${body}\n${close}`)
}
writeFileSync(README, readme)
if (picked) process.stdout.write(`defaults: ${JSON.stringify(picked)}\n`)
