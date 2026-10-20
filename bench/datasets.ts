import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Box, Group } from '../src/types'

export const DATA = process.env.EDGE_DATA ?? join(homedir(), 'DEV/edge-data')

/** One sequence per DETRAC training camera group, used only for tuning. */
export const DETRAC_TRAIN = [
  'detrac_1_MVI_20011',
  'detrac_9_MVI_20061',
  'detrac_17_MVI_39801',
  'detrac_23_MVI_40131',
  'detrac_31_MVI_40191',
  'detrac_41_MVI_40732',
  'detrac_47_MVI_40981',
  'detrac_55_MVI_63552',
]
export const MOT17 = ['MOT17-02-FRCNN', 'MOT17-04-FRCNN', 'MOT17-09-FRCNN']
const MOT17_TUNE = 'MOT17-09-FRCNN'

export type Split = 'tune' | 'report'

export type TruthBox = { id: number; box: Box }

export type Seq = {
  id: string
  set: 'detrac-test' | 'detrac-train' | 'mot17'
  split: Split
  group: Group
  W: number
  H: number
  fps: number
  /** Absolute paths, in frame order; frame n is `frames[n - 1]`. */
  frames: string[]
  /** Labelled boxes by 1-based frame number. */
  truth: Map<number, TruthBox[]>
  zones: Box[]
}

/** Frame number from a DETRAC file name such as `img00042.jpg` or `image000042.jpg`. */
export const frameNo = (file: string): number => Number(/(\d+)\.jpg$/.exec(file)?.[1] ?? Number.NaN)

/** Parses a UA-DETRAC mirror `annotations.csv` into per-frame vehicles and the ignored regions. */
export function parseDetracCsv(csv: string): {
  W: number
  H: number
  truth: Map<number, TruthBox[]>
  zones: Box[]
} {
  const truth = new Map<number, TruthBox[]>()
  const zones = new Map<string, Box>()
  let W = 0
  let H = 0
  for (const line of csv.split('\n').slice(1)) {
    const c = line.split(',')
    if (c.length < 11) continue
    W = Number(c[2])
    H = Number(c[3])
    const box = { x1: Number(c[5]), y1: Number(c[6]), x2: Number(c[7]), y2: Number(c[8]) }
    if (c[4] === 'ignored') zones.set(c.slice(5, 9).join(','), box)
    else if (c[4] === 'vehicle') {
      const frame = frameNo(c[1] as string)
      const list = truth.get(frame) ?? []
      list.push({ id: Number(c[10]), box })
      truth.set(frame, list)
    }
  }
  return { W, H, truth, zones: [...zones.values()] }
}

function detrac(dir: string, id: string, set: Seq['set'], split: Split): Seq {
  const root = join(dir, id)
  const { W, H, truth, zones } = parseDetracCsv(readFileSync(join(root, 'annotations.csv'), 'utf8'))
  const files = readdirSync(root)
    .filter((f) => f.endsWith('.jpg'))
    .sort((a, b) => frameNo(a) - frameNo(b))
  if (files.some((f, i) => frameNo(f) !== i + 1)) throw new Error(`${id}: frames are not 1..n`)
  return {
    id,
    set,
    split,
    group: 'vehicle',
    W,
    H,
    fps: 25,
    frames: files.map((f) => join(root, f)),
    truth,
    zones,
  }
}

function mot17(id: string): Seq {
  const root = join(DATA, 'mot17/MOT17/train', id)
  const ini = Object.fromEntries(
    readFileSync(join(root, 'seqinfo.ini'), 'utf8')
      .split('\n')
      .map((l) => l.trim().split('='))
      .filter((kv) => kv.length === 2),
  )
  const length = Number(ini.seqLength)
  const truth = new Map<number, TruthBox[]>()
  for (const line of readFileSync(join(root, 'gt/gt.txt'), 'utf8').split('\n')) {
    const [frame, tid, x, y, w, h, consider, cls] = line.split(',').map(Number)
    if (frame === undefined || consider !== 1 || cls !== 1) continue
    const list = truth.get(frame) ?? []
    list.push({ id: tid as number, box: { x1: x!, y1: y!, x2: x! + w!, y2: y! + h! } })
    truth.set(frame, list)
  }
  return {
    id: id.replace('-FRCNN', ''),
    set: 'mot17',
    split: id === MOT17_TUNE ? 'tune' : 'report',
    group: 'person',
    W: Number(ini.imWidth),
    H: Number(ini.imHeight),
    fps: Number(ini.frameRate),
    frames: Array.from({ length }, (_, i) =>
      join(root, 'img1', `${String(i + 1).padStart(6, '0')}${ini.imExt}`),
    ),
    truth,
    zones: [],
  }
}

export function loadSequences(split: Split): Seq[] {
  if (split === 'tune')
    return [
      ...DETRAC_TRAIN.map((s) => detrac(join(DATA, 'detrac-train'), s, 'detrac-train', 'tune')),
      mot17(MOT17_TUNE),
    ]
  const test = join(DATA, 'detrac')
  if (!existsSync(test)) throw new Error(`no data in ${DATA}; run tsx bench/data.ts`)
  return [
    ...readdirSync(test)
      .filter((d) => d.startsWith('detrac_'))
      .sort()
      .map((s) => detrac(test, s, 'detrac-test', 'report')),
    ...MOT17.filter((s) => s !== MOT17_TUNE).map(mot17),
  ]
}
