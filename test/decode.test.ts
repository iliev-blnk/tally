import { describe, expect, it } from 'vitest'
import { decodeDetr } from '../src/detect/detr'
import { decodeYolox, letterbox } from '../src/detect/yolox'

const cells = (S: number) => [8, 16, 32].reduce((n, s) => n + (S / s) ** 2, 0)

function yoloxOut(S: number, hot: { cell: [number, number]; cls: number; p: number }[]) {
  const out = new Float32Array(cells(S) * 85)
  const g = S / 8
  for (const h of hot) {
    const k = h.cell[1] * g + h.cell[0]
    out.set([0.5, 0.5, Math.log(4), Math.log(4), 0.9], k * 85)
    out[k * 85 + 5 + h.cls] = h.p
  }
  return out
}

describe('decodeYolox', () => {
  it('decodes a stride-8 cell back to source pixels on a portrait frame', () => {
    const S = 416
    const { r } = letterbox(1080, 1920, S)
    expect(r).toBeCloseTo(416 / 1920)
    const dets = decodeYolox(yoloxOut(S, [{ cell: [10, 5], cls: 2, p: 0.9 }]), S, r, 0.3)
    expect(dets).toHaveLength(1)
    const d = dets[0]!
    expect(d.kind).toBe('car')
    expect(d.score).toBeCloseTo(0.81)
    expect((d.x1 + d.x2) / 2).toBeCloseTo((10.5 * 8) / r, 3)
    expect((d.y1 + d.y2) / 2).toBeCloseTo((5.5 * 8) / r, 3)
    expect(d.x2 - d.x1).toBeCloseTo(32 / r, 3)
  })

  it('suppresses overlaps within a class only and drops unmapped classes', () => {
    const S = 416
    const out = yoloxOut(S, [
      { cell: [10, 5], cls: 2, p: 0.9 },
      { cell: [11, 5], cls: 2, p: 0.8 },
      { cell: [20, 20], cls: 9, p: 0.9 },
    ])
    // A truck on the same spot as the first car survives class-wise NMS.
    const g = S / 8
    const k = 30 * g + 30
    out.set([0.5, 0.5, Math.log(4), Math.log(4), 0.9], k * 85)
    out[k * 85 + 5 + 7] = 0.7
    const dets = decodeYolox(out, S, 1, 0.3)
    expect(dets.map((d) => d.kind).sort()).toEqual(['car', 'truck'])
  })
})

describe('decodeDetr', () => {
  it('applies a sigmoid and maps normalised cxcywh to pixels', () => {
    const logits = new Float32Array(300 * 80).fill(-10)
    const boxes = new Float32Array(300 * 4)
    logits[0] = 2
    boxes.set([0.5, 0.5, 0.1, 0.2], 0)
    logits[80 + 9] = 5 // traffic light: not a counted class
    const dets = decodeDetr(logits, boxes, 960, 540, 0.3)
    expect(dets).toHaveLength(1)
    const d = dets[0]!
    expect(d.kind).toBe('person')
    expect(d.score).toBeCloseTo(1 / (1 + Math.exp(-2)))
    expect([d.x1, d.y1, d.x2, d.y2].map((v) => Math.round(v))).toEqual([432, 216, 528, 324])
  })
})
