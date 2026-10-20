import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Dir, type Line, LineCounter } from '../src/count/counter'
import { insideAny } from '../src/count/zones'
import { centre } from '../src/geom'
import type { Seq } from './datasets'

const MOT_LINES: Record<string, { a: [number, number]; b: [number, number] }> = JSON.parse(
  readFileSync(join(import.meta.dirname, 'lines.json'), 'utf8'),
)

/** Label-derived counts: the counter's own rule applied to the labelled tracks, every frame. */
export function truthCounts(seq: Seq, line: Line): Record<Dir, number> {
  const counter = new LineCounter(line)
  const frames = [...seq.truth.keys()].sort((a, b) => a - b)
  for (const f of frames) {
    // Same as for detections: anything centred in an ignored region doesn't exist.
    const boxes = (seq.truth.get(f) ?? []).filter((t) => !insideAny(centre(t.box), seq.zones))
    counter.update(boxes.map((t) => ({ id: t.id, kind: 'car' as const, box: t.box })))
  }
  return counter.counts().car
}

type Axis = 'h' | 'v'

/** A full-span line: horizontal at y = at, or vertical at x = at. */
const lineAt = (seq: Seq, axis: Axis, at: number): Line =>
  axis === 'h' ? { a: [2, at], b: [seq.W - 2, at] } : { a: [at, 2], b: [at, seq.H - 2] }

/** Fraction of the line's length covered by ignore zones. */
function zoneOverlap(seq: Seq, axis: Axis, at: number): number {
  const len = axis === 'h' ? seq.W : seq.H
  const spans = seq.zones
    .filter((z) => (axis === 'h' ? z.y1 <= at && at <= z.y2 : z.x1 <= at && at <= z.x2))
    .map((z) => (axis === 'h' ? [z.x1, z.x2] : [z.y1, z.y2]))
    .map(([u1 = 0, u2 = 0]) => [Math.max(0, u1), Math.min(len, u2)] as const)
    .sort((p, q) => p[0] - q[0])
  let covered = 0
  let end = 0
  for (const [u1, u2] of spans) {
    if (u2 <= end) continue
    covered += u2 - Math.max(u1, end)
    end = u2
  }
  return covered / len
}

/**
 * DETRAC: a full-span line, horizontal (y in 0.40–0.80 H) or vertical (x in 0.25–0.75 W), in
 * steps of 2%. The orientation of the line with the most labelled crossings wins, since that is
 * the one across the traffic. Of its positions keeping at least 75% of those crossings, take the
 * ones overlapping the ignore zones least (within 2% of the length), then the one nearest the
 * middle (0.6 H or 0.5 W). MOT17: from lines.json.
 */
export function lineFor(seq: Seq): Line {
  if (seq.set === 'mot17') {
    const l = MOT_LINES[seq.id]
    if (!l) throw new Error(`no line for ${seq.id} in bench/lines.json`)
    return { a: [l.a[0] * seq.W, l.a[1] * seq.H], b: [l.b[0] * seq.W, l.b[1] * seq.H] }
  }
  const cands = [
    ...Array.from({ length: 21 }, (_, i) => ({
      axis: 'h' as const,
      at: Math.round(seq.H * (0.4 + i * 0.02)),
      mid: 0.6 * seq.H,
    })),
    ...Array.from({ length: 26 }, (_, i) => ({
      axis: 'v' as const,
      at: Math.round(seq.W * (0.25 + i * 0.02)),
      mid: 0.5 * seq.W,
    })),
  ].map((c) => {
    const t = truthCounts(seq, lineAt(seq, c.axis, c.at))
    return { ...c, overlap: zoneOverlap(seq, c.axis, c.at), crossings: t.in + t.out }
  })
  const top = cands.reduce((p, q) => (q.crossings > p.crossings ? q : p))
  const busy = cands.filter((c) => c.axis === top.axis && c.crossings >= 0.75 * top.crossings)
  const least = Math.min(...busy.map((c) => c.overlap))
  const pick = busy
    .filter((c) => c.overlap <= least + 0.02)
    .sort((p, q) => Math.abs(p.at - p.mid) - Math.abs(q.at - q.mid))[0]
  return lineAt(seq, pick?.axis ?? top.axis, pick?.at ?? top.at)
}
