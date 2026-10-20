import { group } from '../classes'
import { iou } from '../geom'
import type { Box, Detection, Group, Kind } from '../types'
import { hungarian } from './hungarian'
import { BoxFilter } from './kalman'

export type TrackerOpts = {
  /** Detections at or above this score take part in the first association. */
  high: number
  /** Detections below this score are ignored entirely. */
  low: number
  matchIou: number
  lowMatchIou: number
  /** Minimum score for an unmatched detection to start a track. */
  newScore: number
  /** Frames a track survives without an update. */
  buffer: number
}

export const TRACKER_DEFAULTS: TrackerOpts = {
  high: 0.5,
  low: 0.1,
  matchIou: 0.3,
  lowMatchIou: 0.5,
  newScore: 0.6,
  buffer: 30,
}

export type Track = {
  id: number
  box: Box
  kind: Kind
  group: Group
  hits: number
  lastFrame: number
}

type State = {
  id: number
  filter: BoxFilter
  group: Group
  votes: Map<Kind, number>
  hits: number
  lastFrame: number
  predicted: Box
}

/** ByteTrack-style multi-object tracker: Kalman motion, two-stage IoU association. */
export class Tracker {
  private opts: TrackerOpts
  private tracks: State[] = []
  private nextId = 1
  private frame = -1

  constructor(opts: Partial<TrackerOpts> = {}) {
    this.opts = { ...TRACKER_DEFAULTS, ...opts }
  }

  update(dets: Detection[], frame: number): Track[] {
    const dt = this.frame < 0 ? 1 : Math.max(frame - this.frame, 1)
    this.frame = frame
    const o = this.opts
    this.tracks = this.tracks.filter((t) => frame - t.lastFrame <= o.buffer)
    for (const t of this.tracks) {
      t.filter.predict(dt)
      t.predicted = t.filter.box()
    }
    const high = dets.filter((d) => d.score >= o.high)
    const low = dets.filter((d) => d.score < o.high && d.score >= o.low)

    const matched = new Set<State>()
    const free = this.associate(this.tracks, high, o.matchIou, matched)
    this.associate(
      this.tracks.filter((t) => !matched.has(t)),
      low,
      o.lowMatchIou,
      matched,
    )
    for (const d of free) {
      if (d.score < o.newScore) continue
      const t: State = {
        id: this.nextId++,
        filter: new BoxFilter(d),
        group: group(d.kind),
        votes: new Map([[d.kind, 1]]),
        hits: 1,
        lastFrame: frame,
        predicted: d,
      }
      this.tracks.push(t)
      matched.add(t)
    }
    return this.tracks
      .filter((t) => matched.has(t) && t.hits >= 2)
      .map((t) => ({
        id: t.id,
        box: t.filter.box(),
        kind: majority(t.votes),
        group: t.group,
        hits: t.hits,
        lastFrame: t.lastFrame,
      }))
  }

  /** Matches detections to tracks; returns the detections left unmatched. */
  private associate(tracks: State[], dets: Detection[], gate: number, matched: Set<State>) {
    if (!tracks.length || !dets.length) return dets
    const sim = tracks.map((t) =>
      dets.map((d) => (group(d.kind) === t.group ? iou(t.predicted, d) : 0)),
    )
    const rows = hungarian(sim.map((r) => r.map((s) => 1 - s)))
    const used = new Set<number>()
    rows.forEach((j, i) => {
      const t = tracks[i]
      const d = dets[j]
      if (!t || !d || (sim[i]?.[j] ?? 0) < gate) return
      t.filter.update(d)
      t.votes.set(d.kind, (t.votes.get(d.kind) ?? 0) + 1)
      t.hits++
      t.lastFrame = this.frame
      matched.add(t)
      used.add(j)
    })
    return dets.filter((_, j) => !used.has(j))
  }
}

function majority(votes: Map<Kind, number>): Kind {
  let best: Kind = 'car'
  let n = -1
  for (const [k, v] of votes) {
    if (v > n) {
      best = k
      n = v
    }
  }
  return best
}
