// Cuts the page's clips out of the benchmark footage: an H.264 MP4 plus the labels and the
// benchmark's counting line, scaled to the clip.
//   tsx scripts/clips.ts
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadSequences } from '../bench/datasets'
import { lineFor } from '../bench/lines'
import type { ClipData } from '../site/clip'
import { insideAny } from '../src/count/zones'
import { centre } from '../src/geom'

const OUT = join(import.meta.dirname, '../site/public/clips')
const WIDTH = 960
const SECONDS = 30

/** Busy, two-way windows, found by counting labelled crossings in sliding 30 s windows. */
const CLIPS = [
  { name: 'junction', seq: 'detrac_95_MVI_40892', start: 126 },
  { name: 'avenue', seq: 'detrac_68_MVI_39401', start: 1 },
  { name: 'street', seq: 'MOT17-04', start: 101 },
]

mkdirSync(OUT, { recursive: true })
const seqs = [...loadSequences('report')]
for (const clip of CLIPS) {
  const seq = seqs.find((s) => s.id === clip.seq)
  if (!seq) throw new Error(`no sequence ${clip.seq}`)
  const k = WIDTH / seq.W
  const n = Math.min(Math.round(SECONDS * seq.fps), seq.frames.length - clip.start + 1)
  const first = seq.frames[clip.start - 1] as string
  const [, prefix = '', digits = ''] = /([a-z]*)(\d+)\.jpg$/.exec(first) ?? []
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-framerate',
    String(seq.fps),
    '-start_number',
    String(clip.start),
    '-i',
    join(dirname(first), `${prefix}%0${digits.length}d.jpg`),
    '-frames:v',
    String(n),
    '-vf',
    `scale=${WIDTH}:-2`,
    '-c:v',
    'libx264',
    '-crf',
    '26',
    '-preset',
    'slow',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    join(OUT, `${clip.name}.mp4`),
  ])
  const line = lineFor(seq)
  const r = (v: number) => Math.round(v * k)
  const truth: number[][] = []
  for (let f = clip.start; f < clip.start + n; f++)
    for (const t of seq.truth.get(f) ?? []) {
      if (insideAny(centre(t.box), seq.zones)) continue
      truth.push([f - clip.start + 1, t.id, r(t.box.x1), r(t.box.y1), r(t.box.x2), r(t.box.y2)])
    }
  const data: ClipData = {
    source:
      seq.set === 'mot17'
        ? `${seq.id}, frames ${clip.start}–${clip.start + n - 1}`
        : `UA-DETRAC ${seq.id.replace(/^detrac_\d+_/, '')}, frames ${clip.start}–${clip.start + n - 1}`,
    group: seq.set === 'mot17' ? 'person' : 'vehicle',
    W: WIDTH,
    H: Math.round(seq.H * k),
    fps: seq.fps,
    line: { a: [r(line.a[0]), r(line.a[1])], b: [r(line.b[0]), r(line.b[1])] },
    zones: seq.zones.map((z) => [r(z.x1), r(z.y1), r(z.x2), r(z.y2)]),
    truth,
  }
  writeFileSync(join(OUT, `${clip.name}.json`), JSON.stringify(data))
  process.stdout.write(`${clip.name}: ${n} frames, ${truth.length} labelled boxes\n`)
}
