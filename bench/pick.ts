import type { ModelId } from '../src/detect/models'

export type Accuracy = {
  model: ModelId
  strides: { stride: number; wape: number; bias: number }[]
}
export type Speed = { models: Partial<Record<ModelId, { fps: number }>> }

/** Every-frame WAPE on the report split. */
const wape = (a: Accuracy) => a.strides.find((s) => s.stride === 1)?.wape ?? Infinity

/**
 * The shipped defaults: on a GPU, the most accurate model that holds 20 fps on the RTX 3050; on
 * the CPU, the most accurate that holds 8 fps, or failing that the fastest.
 */
export function pickDefaults(
  acc: Accuracy[],
  gpu: Speed,
  cpu: Speed,
): { gpu: ModelId; cpu: ModelId } {
  const best = (ids: ModelId[]) =>
    acc.filter((a) => ids.includes(a.model)).sort((a, b) => wape(a) - wape(b))[0]?.model
  const fps = (s: Speed, m: ModelId) => s.models[m]?.fps ?? 0
  const ids = acc.map((a) => a.model)
  const g = best(ids.filter((m) => fps(gpu, m) >= 20))
  const fastest = [...ids].sort((a, b) => fps(cpu, b) - fps(cpu, a))[0]
  const c = best(ids.filter((m) => fps(cpu, m) >= 8)) ?? fastest
  if (!g || !c) throw new Error('no model meets the bar')
  return { gpu: g, cpu: c }
}
