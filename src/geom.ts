import type { Box } from './types'

export function area(b: Box): number {
  return Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1)
}

/** Intersection over union; 0 when either box has no area. */
export function iou(a: Box, b: Box): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
  if (w <= 0 || h <= 0) return 0
  const i = w * h
  const u = area(a) + area(b) - i
  return u > 0 ? i / u : 0
}

export function centre(b: Box): [number, number] {
  return [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2]
}
