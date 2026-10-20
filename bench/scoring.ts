import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KINDS, LABELLED } from '../src/classes'
import type { Dir, Line } from '../src/count/counter'
import type { ModelId } from '../src/detect/models'
import { Pipeline } from '../src/pipeline'
import type { TrackerOpts } from '../src/track/tracker'
import type { Detection, Group, Kind } from '../src/types'
import { CACHE } from './browser'
import type { Seq } from './datasets'
import { lineFor, truthCounts } from './lines'

export type ScoreOpts = { stride: number; minScore: number; tracker: Partial<TrackerOpts> }

/** Per model, the tune split's best settings and the WAPE they reached there. */
export type Tuned = Record<string, Omit<ScoreOpts, 'stride'> & { wape: number }>

export type SeqScore = {
  id: string
  group: Group
  truth: Record<Dir, number>
  pred: Record<Dir, number>
}

export type Summary = { wape: number; bias: number; truth: number }

export type Score = Summary & { perSeq: SeqScore[]; byGroup: Record<Group, Summary> }

/** Unpacks a cache file: per frame, u32 count then count × (f32 x1 y1 x2 y2 score, u8 kind). */
export function readCache(buf: Buffer): Detection[][] {
  const frames: Detection[][] = []
  for (let p = 0; p < buf.length; ) {
    const n = buf.readUInt32LE(p)
    p += 4
    const dets: Detection[] = []
    for (let i = 0; i < n; i++, p += 21) {
      dets.push({
        x1: buf.readFloatLE(p),
        y1: buf.readFloatLE(p + 4),
        x2: buf.readFloatLE(p + 8),
        y2: buf.readFloatLE(p + 12),
        score: buf.readFloatLE(p + 16),
        kind: KINDS[buf.readUInt8(p + 20)] as Kind,
      })
    }
    frames.push(dets)
  }
  return frames
}

/** A sequence with its line, truth and cached detections, loaded once and replayed many times. */
export type Prepared = { seq: Seq; line: Line; truth: Record<Dir, number>; dets: Detection[][] }

export function prepare(model: ModelId, seqs: Seq[]): Prepared[] {
  return seqs.map((seq) => {
    const line = lineFor(seq)
    const dets = readCache(readFileSync(join(CACHE, model, `${seq.id}.bin`)))
    if (dets.length !== seq.frames.length)
      throw new Error(
        `${model}/${seq.id}: ${dets.length} cached frames, ${seq.frames.length} in seq`,
      )
    return { seq, line, truth: truthCounts(seq, line), dets }
  })
}

function summarise(rows: SeqScore[]): Summary {
  let abs = 0
  let signed = 0
  let truth = 0
  for (const r of rows)
    for (const d of ['in', 'out'] as const) {
      abs += Math.abs(r.pred[d] - r.truth[d])
      signed += r.pred[d] - r.truth[d]
      truth += r.truth[d]
    }
  return { wape: truth ? abs / truth : 0, bias: truth ? signed / truth : 0, truth }
}

/** Replays every `stride`-th frame through zones → tracker → counter and compares with truth. */
export function score(prepared: Prepared[], opts: ScoreOpts): Score {
  const perSeq = prepared.map(({ seq, line, truth, dets }) => {
    const kinds = LABELLED[seq.group]
    const pipe = new Pipeline({
      line,
      zones: seq.zones,
      tracker: { ...opts.tracker, low: opts.minScore },
    })
    for (let i = 0; i < dets.length; i += opts.stride) {
      const keep = (dets[i] ?? []).filter((d) => d.score >= opts.minScore && kinds.includes(d.kind))
      pipe.step(keep, i + 1)
    }
    const c = pipe.counts()
    const pred = { in: 0, out: 0 }
    for (const k of kinds) {
      pred.in += c[k].in
      pred.out += c[k].out
    }
    return { id: seq.id, group: seq.group, truth, pred }
  })
  return {
    ...summarise(perSeq),
    perSeq,
    byGroup: {
      vehicle: summarise(perSeq.filter((r) => r.group === 'vehicle')),
      person: summarise(perSeq.filter((r) => r.group === 'person')),
    },
  }
}
