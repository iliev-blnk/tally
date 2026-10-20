import { existsSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { type Accuracy, pickDefaults, type Speed } from '../bench/pick'
import { DEFAULT_CPU, DEFAULT_GPU, MODEL_IDS } from '../src/detect/models'

const read = <T>(name: string): T => JSON.parse(readFileSync(`bench/results/${name}.json`, 'utf8'))

it('picks the most accurate model over the speed bar, else the fastest', () => {
  const acc = (model: string, wape: number) =>
    ({ model, strides: [{ stride: 1, wape, bias: 0 }] }) as Accuracy
  const speed = (fps: Record<string, number>) =>
    ({ models: Object.fromEntries(Object.entries(fps).map(([m, f]) => [m, { fps: f }])) }) as Speed
  const all = [acc('yolox_nano', 0.2), acc('yolox_s', 0.08), acc('dfine_s', 0.06)]
  expect(
    pickDefaults(
      all,
      speed({ yolox_nano: 80, yolox_s: 30, dfine_s: 15 }),
      speed({ yolox_nano: 6, yolox_s: 2, dfine_s: 1 }),
    ),
  ).toEqual({ gpu: 'yolox_s', cpu: 'yolox_nano' })
})

it.runIf(existsSync('bench/results/speed-cpu.json'))('ships the defaults the bench picks', () => {
  const acc = MODEL_IDS.map((m) => read<Accuracy>(`accuracy-${m}`))
  const picked = pickDefaults(acc, read<Speed>('speed-rtx3050'), read<Speed>('speed-cpu'))
  expect({ gpu: DEFAULT_GPU, cpu: DEFAULT_CPU }).toEqual(picked)
})
