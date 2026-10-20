/** A bundled clip's labels and counting line, written by scripts/clips.ts. */
export type ClipData = {
  source: string
  /** What the labels cover: DETRAC labels vehicles as one class, MOT17 labels pedestrians. */
  group: 'vehicle' | 'person'
  W: number
  H: number
  fps: number
  line: { a: [number, number]; b: [number, number] }
  zones: [number, number, number, number][]
  /** [frame (1-based, within the clip), track id, x1, y1, x2, y2] */
  truth: number[][]
}
