import { describe, expect, it } from 'vitest'
import { cocoKind, group } from '../src/classes'
import { centre, iou } from '../src/geom'

describe('geometry', () => {
  it('iou of identical, disjoint and degenerate boxes', () => {
    const a = { x1: 0, y1: 0, x2: 10, y2: 10 }
    expect(iou(a, a)).toBe(1)
    expect(iou(a, { x1: 20, y1: 20, x2: 30, y2: 30 })).toBe(0)
    expect(iou({ x1: 5, y1: 5, x2: 5, y2: 9 }, { x1: 5, y1: 5, x2: 5, y2: 9 })).toBe(0)
    expect(iou(a, { x1: 5, y1: 0, x2: 15, y2: 10 })).toBeCloseTo(1 / 3)
  })

  it('centre', () => {
    expect(centre({ x1: 0, y1: 10, x2: 20, y2: 30 })).toEqual([10, 20])
  })

  it('maps COCO classes to kinds and groups', () => {
    expect(cocoKind(0)).toBe('person')
    expect(cocoKind(2)).toBe('car')
    expect(cocoKind(7)).toBe('truck')
    expect(cocoKind(9)).toBeNull()
    expect(group('bicycle')).toBe('vehicle')
    expect(group('person')).toBe('person')
  })
})
