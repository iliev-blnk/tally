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
