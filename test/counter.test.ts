import { describe, expect, it } from 'vitest'
import { LineCounter } from '../src/count/counter'
import { filterZones } from '../src/count/zones'
import type { Box, Detection, Kind } from '../src/types'

const at = (id: number, cx: number, cy: number, kind: Kind = 'car') => ({
  id,
  kind,
  box: { x1: cx - 5, y1: cy - 5, x2: cx + 5, y2: cy + 5 },
})

const LINE = { a: [0, 100] as [number, number], b: [200, 100] as [number, number] }

describe('LineCounter', () => {
  it('counts a downward crossing as "in" (left of a→b to right) once', () => {
    const c = new LineCounter(LINE)
    for (let y = 60; y <= 140; y += 10) c.update([at(1, 50, y)])
    expect(c.counts().car).toEqual({ in: 1, out: 0 })
    for (let y = 140; y >= 60; y -= 10) c.update([at(1, 50, y)])
    expect(c.counts().car).toEqual({ in: 1, out: 0 })
  })

  it('counts an upward crossing as "out" and reports the event', () => {
    const c = new LineCounter(LINE)
    c.update([at(2, 50, 120, 'person')])
    expect(c.update([at(2, 50, 90, 'person')])).toEqual([{ id: 2, kind: 'person', dir: 'out' }])
    expect(c.counts().person).toEqual({ in: 0, out: 1 })
  })

  it('ignores crossings beyond the end of the segment', () => {
    const c = new LineCounter(LINE)
    c.update([at(1, 300, 80)])
    c.update([at(1, 300, 120)])
    expect(c.counts().car).toEqual({ in: 0, out: 0 })
  })

  it('counts a jump straight over the line', () => {
    const c = new LineCounter(LINE)
    c.update([at(1, 50, 80)])
    c.update([at(1, 50, 130)])
    expect(c.counts().car.in).toBe(1)
  })

  it('counts nothing on a zero-length line', () => {
    const c = new LineCounter({ a: [50, 100], b: [50, 100] })
    expect(() => {
      c.update([at(1, 50, 80)])
      c.update([at(1, 50, 130)])
    }).not.toThrow()
    expect(c.counts().car).toEqual({ in: 0, out: 0 })
  })

  it('reset clears counts and memory', () => {
    const c = new LineCounter(LINE)
    c.update([at(1, 50, 80)])
    c.update([at(1, 50, 130)])
    c.reset()
    expect(c.total()).toBe(0)
    c.update([at(1, 50, 140)])
    expect(c.total()).toBe(0)
  })
})

describe('filterZones', () => {
  it('drops detections centred in a zone and keeps ones only overlapping it', () => {
    const zone: Box = { x1: 0, y1: 0, x2: 100, y2: 100 }
    const d = (x1: number): Detection => ({
      x1,
      y1: 10,
      x2: x1 + 40,
      y2: 50,
      kind: 'car',
      score: 1,
    })
    expect(filterZones([d(10), d(90)], [zone]).map((x) => x.x1)).toEqual([90])
  })
})
