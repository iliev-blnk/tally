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

const horizontal = (seq: Seq, y: number): Line => ({ a: [2, y], b: [seq.W - 2, y] })

/** Width of the line's span covered by ignore zones. */
function zoneOverlap(seq: Seq, y: number): number {
  const spans = seq.zones
    .filter((z) => z.y1 <= y && y <= z.y2)
    .map((z) => [Math.max(0, z.x1), Math.min(seq.W, z.x2)] as const)
    .sort((a, b) => a[0] - b[0])
  let covered = 0
  let end = 0
  for (const [x1, x2] of spans) {
    if (x2 <= end) continue
    covered += x2 - Math.max(x1, end)
    end = x2
  }
  return covered
}

/**
 * DETRAC: a full-width horizontal line with y in 0.40–0.80 H. Among the heights that overlap the
 * ignore zones least, take the one nearest 0.6 H that keeps at least 75% of the best labelled
 * crossing count (lines near the top cross more, tinier, cars). MOT17: from lines.json.
 */
export function lineFor(seq: Seq): Line {
  if (seq.set === 'mot17') {
    const l = MOT_LINES[seq.id]
    if (!l) throw new Error(`no line for ${seq.id} in bench/lines.json`)
    return { a: [l.a[0] * seq.W, l.a[1] * seq.H], b: [l.b[0] * seq.W, l.b[1] * seq.H] }
  }
  const ys = Array.from({ length: 21 }, (_, i) => Math.round(seq.H * (0.4 + i * 0.02)))
  const least = Math.min(...ys.map((y) => zoneOverlap(seq, y)))
  const options = ys
    .filter((y) => zoneOverlap(seq, y) === least)
    .map((y) => {
      const c = truthCounts(seq, horizontal(seq, y))
      return { y, crossings: c.in + c.out }
    })
  const most = Math.max(...options.map((o) => o.crossings))
  const pick = options
    .filter((o) => o.crossings >= 0.75 * most)
    .sort((p, q) => Math.abs(p.y - 0.6 * seq.H) - Math.abs(q.y - 0.6 * seq.H))[0]
  return horizontal(seq, pick?.y ?? Math.round(seq.H * 0.6))
}
