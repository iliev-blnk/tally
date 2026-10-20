import { cocoKind } from '../classes'
import type { Detection } from '../types'

const CLASSES = 80

/** Decodes D-FINE / RT-DETR outputs: per-query class logits and normalised cx, cy, w, h. */
export function decodeDetr(
  logits: Float32Array,
  boxes: Float32Array,
  W: number,
  H: number,
  minScore: number,
): Detection[] {
  const dets: Detection[] = []
  const queries = logits.length / CLASSES
  for (let q = 0; q < queries; q++) {
    let best = -Infinity
    let cls = -1
    for (let c = 0; c < CLASSES; c++) {
      const l = logits[q * CLASSES + c] ?? -Infinity
      if (l > best) {
        best = l
        cls = c
      }
    }
    const score = 1 / (1 + Math.exp(-best))
    const kind = cocoKind(cls)
    if (score < minScore || !kind) continue
    const [cx = 0, cy = 0, w = 0, h = 0] = boxes.subarray(q * 4, q * 4 + 4)
    dets.push({
      kind,
      score,
      x1: (cx - w / 2) * W,
      y1: (cy - h / 2) * H,
      x2: (cx + w / 2) * W,
      y2: (cy + h / 2) * H,
    })
  }
  return dets
}
