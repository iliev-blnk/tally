import { describe, expect, it } from 'vitest'
import { hungarian } from '../src/track/hungarian'
import { Tracker } from '../src/track/tracker'
import type { Detection, Kind } from '../src/types'

const det = (x: number, y: number, kind: Kind = 'car', score = 0.9, w = 40, h = 30): Detection => ({
  x1: x,
  y1: y,
  x2: x + w,
  y2: y + h,
  kind,
  score,
})

describe('hungarian', () => {
  it('solves the square case', () => {
    expect(
      hungarian([
        [4, 1, 3],
        [2, 0, 5],
        [3, 2, 2],
      ]),
    ).toEqual([1, 0, 2])
  })

  it('handles more columns than rows and more rows than columns', () => {
    expect(
      hungarian([
        [5, 1, 9],
        [1, 5, 9],
      ]),
    ).toEqual([1, 0])
    expect(hungarian([[1], [0], [3]])).toEqual([-1, 0, -1])
    expect(hungarian([])).toEqual([])
  })
})

describe('Tracker', () => {
  it('keeps one id for a steadily moving box', () => {
    const t = new Tracker()
    const ids = new Set<number>()
    for (let f = 0; f < 20; f++) for (const tr of t.update([det(10 * f, 50)], f)) ids.add(tr.id)
    expect(ids.size).toBe(1)
  })

  it('keeps ids when two boxes cross paths', () => {
    const t = new Tracker()
    const first = new Map<number, number>()
    let last: { id: number; x: number }[] = []
    for (let f = 0; f < 30; f++) {
      const out = t.update(
        [det(8 * f, 100, 'car', 0.9, 40, 60), det(240 - 8 * f, 110, 'car', 0.9, 40, 60)],
        f,
      )
      if (f === 3) for (const tr of out) first.set(tr.id, tr.box.x1)
      last = out.map((tr) => ({ id: tr.id, x: tr.box.x1 }))
    }
    expect(last).toHaveLength(2)
    for (const { id, x } of last) {
      // The track that started on the left ends on the right, and vice versa.
      expect(Math.sign(x - 120)).toBe(-Math.sign((first.get(id) ?? 0) - 120))
    }
  })

  it('bridges a short gap and starts a new id after the buffer', () => {
    const t = new Tracker({ buffer: 5 })
    const ids = new Set<number>()
    for (let f = 0; f < 10; f++) for (const tr of t.update([det(5 * f, 0)], f)) ids.add(tr.id)
    for (let f = 11; f < 20; f++) for (const tr of t.update([det(5 * f, 0)], f)) ids.add(tr.id)
    expect(ids.size).toBe(1)
    for (let f = 40; f < 45; f++) for (const tr of t.update([det(5 * f, 0)], f)) ids.add(tr.id)
    expect(ids.size).toBe(2)
  })

  it('uses low-score detections to extend tracks but not to start them', () => {
    const t = new Tracker()
    for (let f = 0; f < 5; f++) t.update([det(5 * f, 0)], f)
    const out = t.update([det(25, 0, 'car', 0.3), det(500, 500, 'car', 0.3)], 5)
    expect(out).toHaveLength(1)
    expect(out[0]!.box.x1).toBeCloseTo(25, 0)
    expect(t.update([det(500, 500, 'car', 0.3)], 6)).toHaveLength(0)
  })

  it('never matches across groups', () => {
    const t = new Tracker()
    for (let f = 0; f < 5; f++) t.update([det(0, 0, 'car')], f)
    const out = t.update([det(0, 0, 'person')], 5)
    expect(out.every((tr) => tr.kind !== 'person')).toBe(true)
    const next = t.update([det(0, 0, 'person')], 6)
    expect(next.find((tr) => tr.kind === 'person')?.id).not.toBe(out[0]?.id)
  })

  it('survives a zero-width box', () => {
    const t = new Tracker()
    expect(() => {
      for (let f = 0; f < 3; f++) t.update([det(0, 0, 'car', 0.9, 0, 10)], f)
    }).not.toThrow()
  })

  it('reports the majority kind', () => {
    const t = new Tracker()
    const kinds: Kind[] = ['car', 'truck', 'car', 'car', 'truck', 'car']
    let out: ReturnType<Tracker['update']> = []
    kinds.forEach((k, f) => {
      out = t.update([det(4 * f, 0, k)], f)
    })
    expect(out[0]?.kind).toBe('car')
  })
})
