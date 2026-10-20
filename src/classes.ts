import type { Group, Kind } from './types'

const COCO: Partial<Record<number, Kind>> = {
  0: 'person',
  1: 'bicycle',
  2: 'car',
  3: 'motorcycle',
  5: 'bus',
  7: 'truck',
}

/** The counted kind for a COCO class index, or null for everything else. */
export function cocoKind(id: number): Kind | null {
  return COCO[id] ?? null
}

export function group(k: Kind): Group {
  return k === 'person' ? 'person' : 'vehicle'
}

export const KINDS: Kind[] = ['car', 'bus', 'truck', 'motorcycle', 'bicycle', 'person']

/**
 * The kinds each dataset's labels cover. DETRAC labels cars, buses, vans and lorries but not the
 * (many) bikes and scooters; MOT17 labels people. Detections of other kinds are dropped before
 * tracking whenever counts are compared with labels.
 */
export const LABELLED: Record<Group, Kind[]> = {
  vehicle: ['car', 'bus', 'truck'],
  person: ['person'],
}
