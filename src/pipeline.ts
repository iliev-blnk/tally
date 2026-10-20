import { type CountEvent, type Line, LineCounter } from './count/counter'
import { filterZones } from './count/zones'
import { type Track, Tracker, type TrackerOpts } from './track/tracker'
import type { Box, Detection } from './types'

export type PipelineOpts = { line: Line; zones?: Box[]; tracker?: Partial<TrackerOpts> }

/** Ignore zones → tracker → line counter, one processed frame at a time. */
export class Pipeline {
  private tracker: Tracker
  private counter: LineCounter
  private zones: Box[]

  constructor(opts: PipelineOpts) {
    this.tracker = new Tracker(opts.tracker)
    this.counter = new LineCounter(opts.line)
    this.zones = opts.zones ?? []
  }

  step(dets: Detection[], frame: number): { tracks: Track[]; events: CountEvent[] } {
    const tracks = this.tracker.update(filterZones(dets, this.zones), frame)
    return { tracks, events: this.counter.update(tracks) }
  }

  /** Swaps the counting line; counts restart, tracks carry on. */
  setLine(line: Line): void {
    this.counter = new LineCounter(line)
  }

  get line(): Line {
    return this.counter.line
  }

  counts() {
    return this.counter.counts()
  }

  total() {
    return this.counter.total()
  }
}

export type { CountEvent, Counts, Dir, Line, Point } from './count/counter'
export type { Track, TrackerOpts } from './track/tracker'
export type { Box, Detection, Group, Kind } from './types'
