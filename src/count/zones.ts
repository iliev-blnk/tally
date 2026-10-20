import { centre } from '../geom'
import type { Box, Detection } from '../types'
import type { Point } from './counter'

export function insideAny(p: Point, zones: Box[]): boolean {
  return zones.some((z) => p[0] >= z.x1 && p[0] <= z.x2 && p[1] >= z.y1 && p[1] <= z.y2)
}

/** Drops detections whose centre falls inside an ignore zone. */
export function filterZones(dets: Detection[], zones: Box[]): Detection[] {
  return zones.length ? dets.filter((d) => !insideAny(centre(d), zones)) : dets
}
