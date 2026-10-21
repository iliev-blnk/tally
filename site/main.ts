import tuned from '../bench/results/tuned.json'
import { KINDS, LABELLED } from '../src/classes'
import { type Counts, emptyCounts, LineCounter } from '../src/count/counter'
import { DetectorClient } from '../src/detect/client'
import { DEFAULT_CPU, DEFAULT_GPU, MODEL_IDS, MODELS, type ModelId } from '../src/detect/models'
import type { Backend } from '../src/detect/session'
import { centre } from '../src/geom'
import type { Box, Kind, Line, Point, Track, TrackerOpts } from '../src/pipeline'
import { Pipeline } from '../src/pipeline'
import type { ClipData } from './clip'
import './style.css'
import { arrow, draw, inNormal, palette } from './view'

const CLIPS = ['avenue', 'junction', 'street'] as const
const OWN_FPS = 30
const TRAIL = 24
const FLASH_MS = 700
const DARK_SECONDS = 2

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const video = $<HTMLVideoElement>('video')
const canvas = $<HTMLCanvasElement>('overlay')
const table = $<HTMLTableElement>('counts')
const facts = $<HTMLParagraphElement>('facts')
const credits = $<HTMLSpanElement>('source')
const file = $<HTMLInputElement>('file')
const g = canvas.getContext('2d') as CanvasRenderingContext2D
const base = new URL(import.meta.env.BASE_URL, location.href).href

type Settings = { minScore: number; tracker: Partial<TrackerOpts> }
const settings = (m: ModelId): Settings =>
  (tuned as Partial<Record<ModelId, Settings>>)[m] ?? { minScore: 0.3, tracker: {} }

/** Replays the clip's labelled tracks through the same line counter, frame by frame. */
class Truth {
  private i = 0
  private counter: LineCounter

  constructor(
    private rows: number[][],
    private kind: Kind,
    line: Line,
    from: number,
  ) {
    this.counter = new LineCounter(line)
    while (this.i < rows.length && (rows[this.i]?.[0] ?? 0) < from) this.i++
  }

  advance(frame: number): void {
    const rows = this.rows
    while (this.i < rows.length && (rows[this.i]?.[0] ?? Infinity) <= frame) {
      const f = rows[this.i]?.[0]
      const batch = []
      for (let r = rows[this.i]; r && r[0] === f; r = rows[++this.i]) {
        const [, id = 0, x1 = 0, y1 = 0, x2 = 0, y2 = 0] = r
        batch.push({ id, kind: this.kind, box: { x1, y1, x2, y2 } })
      }
      this.counter.update(batch)
    }
  }

  counts(): Counts {
    return this.counter.counts()
  }
}

type Source = { label: string; url: string; data: ClipData | null; fps: number }

const s = {
  source: null as Source | null,
  client: null as DetectorClient | null,
  model: DEFAULT_GPU as ModelId,
  line: { a: [0, 0], b: [0, 0] } as Line,
  zones: [] as Box[],
  pipeline: null as Pipeline | null,
  truth: null as Truth | null,
  /** Bumped on every reset so a detection in flight from before it is dropped. */
  gen: 0,
  inflight: false,
  frame: 0,
  shown: 0,
  processed: 0,
  fps: 0,
  lastDone: 0,
  tracks: [] as Track[],
  trails: new Map<number, Point[]>(),
  flashes: new Map<number, number>(),
  error: '',
  /** Whether a frame of this source has had any light in it; until one has, frames are checked. */
  lit: false,
  /** The frame where the current run of pure black frames began, or 0. */
  darkFrom: 0,
  /** Pure black for DARK_SECONDS of video, with nothing lit before. */
  blank: false,
}

/** Starts both counts over; the labels are replayed from frame `from` on. */
function restart(from: number): void {
  s.gen++
  s.pipeline = new Pipeline({ line: s.line, zones: s.zones, tracker: settings(s.model).tracker })
  s.tracks = []
  s.trails.clear()
  s.flashes.clear()
  s.shown = 0
  s.processed = 0
  restartTruth(from)
}

function restartTruth(from: number): void {
  const d = s.source?.data
  s.truth = d ? new Truth(d.truth, d.group === 'person' ? 'person' : 'car', s.line, from) : null
}

/** A new line: both counters start again from the current frame, tracks carry on. */
function setLine(line: Line): void {
  s.line = line
  s.pipeline?.setLine(line)
  restartTruth(s.frame + 1)
  render()
}

function load(src: Source): void {
  s.source = src
  const d = src.data
  s.zones = d?.zones.map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 })) ?? []
  if (d) s.line = { a: [...d.line.a], b: [...d.line.b] }
  s.frame = 0
  s.lit = false
  s.darkFrom = 0
  s.blank = false
  restart(0)
  for (const a of document.querySelectorAll<HTMLAnchorElement>('#clips a'))
    a.toggleAttribute('aria-current', a.hash === `#${location.hash.slice(1) || CLIPS[0]}` && !!d)
  credits.textContent = d ? `${d.source}, CC BY-NC-SA 3.0` : `${src.label}, on this device only`
  video.src = src.url
  video.play().catch(() => {})
}

async function loadClip(name: string): Promise<void> {
  const clip = (CLIPS as readonly string[]).includes(name) ? name : CLIPS[0]
  const data: ClipData = await (await fetch(`${base}clips/${clip}.json`)).json()
  load({ label: clip, url: `${base}clips/${clip}.mp4`, data, fps: data.fps })
}

video.addEventListener('loadedmetadata', () => {
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  if (!s.source?.data) {
    const y = Math.round(video.videoHeight * 0.6)
    s.line = { a: [2, y], b: [video.videoWidth - 2, y] }
    s.pipeline?.setLine(s.line)
  }
  render()
})

function onFrame(_now: number, meta: VideoFrameCallbackMetadata): void {
  video.requestVideoFrameCallback(onFrame)
  const src = s.source
  if (!src) return
  const f = Math.round(meta.mediaTime * src.fps) + 1
  // The clip looped (or was sought back): start the count over.
  if (f < s.frame) restart(0)
  s.frame = f
  s.shown++
  s.truth?.advance(f)
  if (s.client && !s.inflight) detect(s.client, f)
  render()
}

// Some setups hand the page a pure black picture for every video frame: Chromium on a Linux
// laptop with Intel and NVIDIA graphics did, with GPU compositing on. Until a frame with any
// light in it turns up, each one is checked at thumbnail size, so the page can say so instead
// of counting nothing.
const thumb = new OffscreenCanvas(64, 36).getContext('2d', {
  willReadFrequently: true,
}) as OffscreenCanvasRenderingContext2D

function look(b: ImageBitmap, frame: number): void {
  thumb.drawImage(b, 0, 0, 64, 36)
  const { data } = thumb.getImageData(0, 0, 64, 36)
  // Alpha is left out: the blanked frames are opaque.
  if (data.some((v, i) => i % 4 !== 3 && v > 0)) {
    s.lit = true
    s.blank = false
  } else if (!s.darkFrom) s.darkFrom = frame
  else if (frame - s.darkFrom >= DARK_SECONDS * (s.source?.fps ?? OWN_FPS)) s.blank = true
}

async function detect(client: DetectorClient, frame: number): Promise<void> {
  s.inflight = true
  const gen = s.gen
  const { minScore } = settings(client.model)
  try {
    const bitmap = await createImageBitmap(video)
    if (!s.lit && gen === s.gen) look(bitmap, frame)
    const { dets } = await client.detect(bitmap, minScore)
    if (gen !== s.gen || !s.pipeline) return
    const kinds = counted()
    const { tracks, events } = s.pipeline.step(
      dets.filter((d) => kinds.includes(d.kind)),
      frame,
    )
    s.tracks = tracks
    const live = new Set(tracks.map((t) => t.id))
    for (const id of s.trails.keys()) if (!live.has(id)) s.trails.delete(id)
    for (const t of tracks) {
      const trail = s.trails.get(t.id) ?? []
      trail.push(centre(t.box))
      if (trail.length > TRAIL) trail.shift()
      s.trails.set(t.id, trail)
    }
    const now = performance.now()
    for (const e of events) s.flashes.set(e.id, now)
    s.processed++
    if (s.lastDone) {
      // Processed frames per second, smoothed over about two seconds.
      const dt = (now - s.lastDone) / 1000
      const a = 1 - Math.exp(-dt / 2)
      s.fps = s.fps ? s.fps + a * (1 / dt - s.fps) : 1 / dt
    }
    s.lastDone = now
  } catch (e) {
    s.error = String(e)
  } finally {
    s.inflight = false
  }
}

function render(): void {
  if (!canvas.width) return
  const now = performance.now()
  for (const [id, t] of s.flashes) if (now - t > FLASH_MS) s.flashes.delete(id)
  const scale = canvas.width / (canvas.clientWidth || canvas.width)
  draw(
    g,
    { tracks: s.tracks, trails: s.trails, flashes: s.flashes, line: s.line, zones: s.zones },
    palette(canvas),
    scale,
  )
  renderCounts()
  renderFacts()
}

const NAMES: Record<Kind, string> = {
  car: 'cars',
  bus: 'buses',
  truck: 'trucks',
  motorcycle: 'motorbikes',
  bicycle: 'bikes',
  person: 'people',
}

/** The kinds counted: on a bundled clip, only what its labels cover, as in the benchmark. */
const counted = (): Kind[] => {
  const d = s.source?.data
  return d ? LABELLED[d.group] : KINDS
}

function renderCounts(): void {
  const live = s.pipeline?.counts() ?? emptyCounts()
  const kinds = counted()
  const [nx, ny] = inNormal(s.line)
  const arrows = [arrow([nx, ny]), arrow([-nx, -ny])]
  const sum = (c: Counts, dir: 'in' | 'out') => kinds.reduce((n, k) => n + c[k][dir], 0)
  const rows: string[] = []
  const row = (cls: string, name: string, a: number, b: number) =>
    rows.push(`<tr class="${cls}"><th scope="row">${name}</th><td>${a}</td><td>${b}</td></tr>`)
  // Per-kind rows only once there is more than one kind to tell apart.
  const seen = kinds.filter((k) => live[k].in + live[k].out > 0)
  if (seen.length > 1) for (const k of seen) row('kind', NAMES[k], live[k].in, live[k].out)
  const group = s.source?.data?.group
  const label = group === 'person' ? 'people counted' : group ? 'vehicles counted' : 'counted'
  row('total', label, sum(live, 'in'), sum(live, 'out'))
  if (s.truth) {
    const t = s.truth.counts()
    row('truth', 'from the labels', sum(t, 'in'), sum(t, 'out'))
  } else
    rows.push('<tr class="truth"><th scope="row" colspan="3">no labels for this video</th></tr>')
  const html = `<thead><tr><td></td><th scope="col">${arrows[0]}</th><th scope="col">${arrows[1]}</th></tr></thead><tbody>${rows.join('')}</tbody>`
  if (table.innerHTML !== html) table.innerHTML = html
}

function renderFacts(): void {
  const c = s.client
  let text: string
  if (s.error) text = `detector stopped: ${s.error}`
  else if (s.blank)
    text =
      "every frame so far is pure black. If the video isn't, the browser is blanking the frames it gives this page: try another browser, or turn off hardware video decoding."
  else if (!c) text = `loading ${MODELS[s.model].name}…`
  else {
    const ep =
      c.ep === 'webgpu'
        ? `WebGPU, ${c.adapter}`
        : `WASM, ${crossOriginIsolated ? 'threaded' : 'one thread'}`
    text = `${MODELS[c.model].name} · ${ep} · ${s.fps.toFixed(1)} fps · ${s.processed} of ${s.shown} frames analysed`
  }
  if (facts.textContent !== text) facts.textContent = text
}

// Line editing: drag an end of the line, or drag across empty footage to draw a new one.
let drag: { end: 'a' | 'b'; before: Line } | null = null

function toVideo(e: PointerEvent): Point {
  const r = canvas.getBoundingClientRect()
  const x = ((e.clientX - r.left) / r.width) * canvas.width
  const y = ((e.clientY - r.top) / r.height) * canvas.height
  return [Math.min(Math.max(x, 0), canvas.width), Math.min(Math.max(y, 0), canvas.height)]
}

function nearEnd(p: Point): 'a' | 'b' | null {
  const reach = 22 * (canvas.width / canvas.clientWidth)
  for (const end of ['a', 'b'] as const) {
    const q = s.line[end]
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) < reach) return end
  }
  return null
}

canvas.addEventListener('pointerdown', (e) => {
  const p = toVideo(e)
  const before: Line = { a: [...s.line.a], b: [...s.line.b] }
  const end = nearEnd(p)
  if (end) drag = { end, before }
  else {
    drag = { end: 'b', before }
    s.line = { a: p, b: p }
  }
  canvas.setPointerCapture(e.pointerId)
  render()
})

canvas.addEventListener('pointermove', (e) => {
  const p = toVideo(e)
  if (!drag) {
    canvas.style.cursor = nearEnd(p) ? 'grab' : 'crosshair'
    return
  }
  s.line = { ...s.line, [drag.end]: p }
  render()
})

const endDrag = () => {
  if (!drag) return
  const { a, b } = s.line
  const short = Math.hypot(b[0] - a[0], b[1] - a[1]) < 30 * (canvas.width / canvas.clientWidth)
  setLine(short ? drag.before : s.line)
  drag = null
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)

// The visitor's own video: played locally, counted live, no labels to compare against.
function useFile(f: File | undefined): void {
  if (!f?.type.startsWith('video/')) return
  history.replaceState(null, '', location.pathname + location.search)
  load({ label: f.name, url: URL.createObjectURL(f), data: null, fps: OWN_FPS })
}
file.addEventListener('change', () => useFile(file.files?.[0]))
const stage = $<HTMLDivElement>('stage')
stage.addEventListener('dragover', (e) => e.preventDefault())
stage.addEventListener('drop', (e) => {
  e.preventDefault()
  useFile(e.dataTransfer?.files[0])
})

window.addEventListener('hashchange', () => loadClip(location.hash.slice(1)))
new ResizeObserver(() => render()).observe(canvas)

async function start(): Promise<void> {
  const q = new URLSearchParams(location.search)
  const ep = (q.get('ep') as Backend | null) ?? 'auto'
  const asked = q.get('model') as ModelId | null
  const gpu = ep !== 'wasm' && !!(await navigator.gpu?.requestAdapter().catch(() => null))
  s.model = asked && MODEL_IDS.includes(asked) ? asked : gpu ? DEFAULT_GPU : DEFAULT_CPU
  loadClip(location.hash.slice(1))
  video.requestVideoFrameCallback(onFrame)
  try {
    s.client = await DetectorClient.create({
      model: s.model,
      ep: gpu ? ep : 'wasm',
      baseUrl: base,
      power: 'high-performance',
    })
    restart(s.frame + 1)
  } catch (e) {
    s.error = String(e)
  }
  render()
}

start()
