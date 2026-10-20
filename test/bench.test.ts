import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDetracCsv, type Seq, type TruthBox } from '../bench/datasets'
import { lineFor, truthCounts } from '../bench/lines'
import type { Box } from '../src/types'

const box = (cx: number, cy: number, s = 20): Box => ({
  x1: cx - s,
  y1: cy - s,
  x2: cx + s,
  y2: cy + s,
})

function seq(tracks: TruthBox[][], zones: Box[] = []): Seq {
  return {
    id: 'synthetic',
    set: 'detrac-test',
    split: 'report',
    group: 'vehicle',
    W: 960,
    H: 540,
    fps: 25,
    frames: tracks.map((_, i) => `${i + 1}.jpg`),
    truth: new Map(tracks.map((t, i) => [i + 1, t])),
    zones,
  }
}

/** One car driving straight down the middle of the frame, top to bottom. */
const downward = (id: number, x: number) =>
  Array.from({ length: 50 }, (_, i) => [{ id, box: box(x, 20 + i * 10) }])

describe('DETRAC annotations', () => {
  it('splits vehicles by frame and dedupes ignored regions', () => {
    const p = parseDetracCsv(readFileSync('test/fixtures/detrac-mini.csv', 'utf8'))
    expect([p.W, p.H]).toEqual([960, 540])
    expect(p.truth.get(1)).toEqual([{ id: 1, box: { x1: 100, y1: 100, x2: 150, y2: 140 } }])
    expect(p.truth.get(2)?.[0]?.box.y1).toBe(110)
    expect(p.zones).toEqual([{ x1: 0.5, y1: 200, x2: 300, y2: 260 }])
  })
})

describe('truth counts', () => {
  it('counts a labelled track crossing the line once, in its direction', () => {
    const s = seq(downward(7, 480))
    expect(truthCounts(s, { a: [2, 300], b: [958, 300] })).toEqual({ in: 1, out: 0 })
  })

  it('ignores labelled boxes centred in an ignore zone', () => {
    const s = seq(downward(7, 480), [{ x1: 400, y1: 0, x2: 560, y2: 540 }])
    expect(truthCounts(s, { a: [2, 300], b: [958, 300] })).toEqual({ in: 0, out: 0 })
  })
})

describe('line placement', () => {
  it('keeps DETRAC lines out of a full-width ignore band', () => {
    const tracks = downward(1, 300).map((f, i) => [...f, ...(downward(2, 700)[i] ?? [])])
    const s = seq(tracks, [{ x1: 0, y1: 0.4 * 540, x2: 960, y2: 0.5 * 540 }])
    const l = lineFor(s)
    expect(l.a[1]).toBe(l.b[1])
    expect(l.a[1] < 0.4 * 540 || l.a[1] > 0.5 * 540).toBe(true)
    expect(l.a[1]).toBe(Math.round(0.6 * 540))
  })

  it('reads MOT17 lines from lines.json in pixels', () => {
    const s = { ...seq([]), id: 'MOT17-04', set: 'mot17' as const, W: 1920, H: 1080 }
    expect(lineFor(s).a[1]).toBe(540)
  })
})
