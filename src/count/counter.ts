import { KINDS } from '../classes'
import { centre } from '../geom'
import type { Box, Kind } from '../types'

export type Point = [number, number]
export type Line = { a: Point; b: Point }
/** `in`: the anchor passes from the left of a→b (as seen on screen) to its right. */
export type Dir = 'in' | 'out'
export type Counts = Record<Kind, Record<Dir, number>>
export type CountEvent = { id: number; kind: Kind; dir: Dir }

type Counted = { id: number; kind: Kind; box: Box }

/** Screen-space side of p relative to a→b: negative on the left, positive on the right. */
function side(l: Line, p: Point): number {
  return (l.b[0] - l.a[0]) * (p[1] - l.a[1]) - (l.b[1] - l.a[1]) * (p[0] - l.a[0])
}

/** Counts each track at most once, when its box centre crosses the line segment. */
export class LineCounter {
  private last = new Map<number, Point>()
  private done = new Set<number>()
  private tally: Counts = emptyCounts()

  constructor(readonly line: Line) {}

  update(tracks: Counted[]): CountEvent[] {
    const l = this.line
    const degenerate = l.a[0] === l.b[0] && l.a[1] === l.b[1]
    const events: CountEvent[] = []
    for (const t of tracks) {
      if (degenerate || this.done.has(t.id)) continue
      const p = centre(t.box)
      const s1 = side(l, p)
      // A point exactly on the line is skipped, so the crossing registers on the far side.
      if (s1 === 0) continue
      const q = this.last.get(t.id)
      this.last.set(t.id, p)
      if (!q) continue
      const s0 = side(l, q)
      if (Math.sign(s0) === Math.sign(s1)) continue
      // The anchor's path must cross the segment itself, not its extension.
      const path: Line = { a: q, b: p }
      if (Math.sign(side(path, l.a)) === Math.sign(side(path, l.b))) continue
      const dir: Dir = s0 < 0 ? 'in' : 'out'
      this.done.add(t.id)
      this.tally[t.kind][dir]++
      events.push({ id: t.id, kind: t.kind, dir })
    }
    return events
  }

  counts(): Counts {
    return structuredClone(this.tally)
  }

  total(): number {
    return KINDS.reduce((n, k) => n + this.tally[k].in + this.tally[k].out, 0)
  }

  reset(): void {
    this.last.clear()
    this.done.clear()
    this.tally = emptyCounts()
  }
}

export function emptyCounts(): Counts {
  return Object.fromEntries(KINDS.map((k) => [k, { in: 0, out: 0 }])) as Counts
}
