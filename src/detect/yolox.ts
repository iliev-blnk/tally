import { cocoKind } from '../classes'
import type { Detection } from '../types'
import { nms } from './nms'

const STRIDES = [8, 16, 32]
const ROW = 85

/** Scale for fitting a W×H frame into an S×S square, anchored top-left (YOLOX's letterbox). */
export function letterbox(W: number, H: number, S: number): { r: number } {
  return { r: Math.min(S / W, S / H) }
}

/**
 * Decodes the raw YOLOX head (grid offsets, log sizes, sigmoid objectness and class scores)
 * into boxes in source pixels.
 */
export function decodeYolox(out: Float32Array, S: number, r: number, minScore: number) {
  const dets: Detection[] = []
  let k = 0
  for (const st of STRIDES) {
    const g = S / st
    for (let y = 0; y < g; y++) {
      for (let x = 0; x < g; x++, k++) {
        const b = k * ROW
        const obj = out[b + 4] ?? 0
        if (obj < minScore) continue
        let best = 0
        let cls = -1
        for (let c = 0; c < 80; c++) {
          const p = out[b + 5 + c] ?? 0
          if (p > best) {
            best = p
            cls = c
          }
        }
        const score = obj * best
        const kind = cocoKind(cls)
        if (score < minScore || !kind) continue
        const cx = ((out[b] ?? 0) + x) * st
        const cy = ((out[b + 1] ?? 0) + y) * st
        const w = Math.exp(out[b + 2] ?? 0) * st
        const h = Math.exp(out[b + 3] ?? 0) * st
        dets.push({
          kind,
          score,
          x1: (cx - w / 2) / r,
          y1: (cy - h / 2) / r,
          x2: (cx + w / 2) / r,
          y2: (cy + h / 2) / r,
        })
      }
    }
  }
  return nms(dets, 0.45)
}
