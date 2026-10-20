import { iou } from '../geom'
import type { Detection } from '../types'

/** Greedy non-maximum suppression within each kind. */
export function nms(dets: Detection[], thr: number): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score)
  const keep: Detection[] = []
  for (const d of sorted) {
    if (!keep.some((k) => k.kind === d.kind && iou(k, d) > thr)) keep.push(d)
  }
  return keep
}
