import type { Line, Point } from '../src/count/counter'
import type { Track } from '../src/track/tracker'
import type { Box, Kind } from '../src/types'

/** Overlay colours, read from the page's CSS custom properties so each look styles its own. */
export type Palette = {
  vehicle: string
  person: string
  line: string
  handle: string
  zone: string
  flash: string
  font: string
}

export function palette(el: Element): Palette {
  const s = getComputedStyle(el)
  const v = (name: string) => s.getPropertyValue(name).trim()
  return {
    vehicle: v('--box-vehicle'),
    person: v('--box-person'),
    line: v('--line'),
    handle: v('--handle'),
    zone: v('--zone'),
    flash: v('--flash'),
    font: v('--overlay-font'),
  }
}

export type Frame = {
  tracks: Track[]
  trails: Map<number, Point[]>
  /** Track id → frames since it was counted, for a short highlight. */
  flashes: Map<number, number>
  line: Line
  zones: Box[]
}

const LABEL: Record<Kind, string> = {
  car: 'car',
  bus: 'bus',
  truck: 'truck',
  motorcycle: 'motorbike',
  bicycle: 'bike',
  person: 'person',
}

function hatch(g: CanvasRenderingContext2D, color: string): CanvasPattern | null {
  const tile = new OffscreenCanvas(10, 10)
  const t = tile.getContext('2d')
  if (!t) return null
  t.strokeStyle = color
  t.lineWidth = 1.5
  t.beginPath()
  t.moveTo(0, 10)
  t.lineTo(10, 0)
  t.stroke()
  return g.createPattern(tile, 'repeat')
}

/** Unit normal pointing to the line's "in" side (screen right of a→b). */
export function inNormal(l: Line): Point {
  const dx = l.b[0] - l.a[0]
  const dy = l.b[1] - l.a[1]
  const len = Math.hypot(dx, dy) || 1
  return [-dy / len, dx / len]
}

/** The arrow glyph closest to a screen direction. */
export function arrow([x, y]: Point): string {
  const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗']
  const i = Math.round(Math.atan2(y, x) / (Math.PI / 4))
  return arrows[(i + 8) % 8] as string
}

export function draw(g: CanvasRenderingContext2D, f: Frame, p: Palette, scale: number): void {
  const { width: W, height: H } = g.canvas
  g.clearRect(0, 0, W, H)
  const px = (n: number) => n * scale

  if (f.zones.length) {
    g.fillStyle = hatch(g, p.zone) ?? p.zone
    for (const z of f.zones) g.fillRect(z.x1, z.y1, z.x2 - z.x1, z.y2 - z.y1)
  }

  g.lineJoin = 'round'
  g.lineCap = 'round'
  for (const t of f.tracks) {
    const color = t.group === 'person' ? p.person : p.vehicle
    const trail = f.trails.get(t.id)
    if (trail && trail.length > 1) {
      g.strokeStyle = color
      g.globalAlpha = 0.55
      g.lineWidth = px(2)
      g.beginPath()
      for (const [i, [x, y]] of trail.entries()) {
        if (i) g.lineTo(x, y)
        else g.moveTo(x, y)
      }
      g.stroke()
      g.globalAlpha = 1
    }
    const flash = f.flashes.has(t.id)
    g.strokeStyle = flash ? p.flash : color
    g.lineWidth = px(flash ? 3 : 1.5)
    const { x1, y1, x2, y2 } = t.box
    g.strokeRect(x1, y1, x2 - x1, y2 - y1)
    g.font = `500 ${px(11)}px ${p.font}`
    const label = LABEL[t.kind]
    const tw = g.measureText(label).width + px(6)
    g.fillStyle = flash ? p.flash : color
    g.fillRect(x1 - px(0.75), y1 - px(14), tw, px(14))
    g.fillStyle = '#000'
    g.fillText(label, x1 + px(3), y1 - px(3.5))
  }

  const { a, b } = f.line
  g.strokeStyle = p.line
  g.lineWidth = px(3)
  g.beginPath()
  g.moveTo(...a)
  g.lineTo(...b)
  g.stroke()
  // The "in" side, as a small arrow off the middle of the line.
  const [nx, ny] = inNormal(f.line)
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const L = px(18)
  g.beginPath()
  g.moveTo(mx, my)
  g.lineTo(mx + nx * L, my + ny * L)
  g.moveTo(mx + nx * L - (nx + ny) * px(6), my + ny * L - (ny - nx) * px(6))
  g.lineTo(mx + nx * L, my + ny * L)
  g.lineTo(mx + nx * L - (nx - ny) * px(6), my + ny * L - (ny + nx) * px(6))
  g.stroke()
  for (const [x, y] of [a, b]) {
    g.fillStyle = p.handle
    g.beginPath()
    g.arc(x, y, px(7), 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = p.line
    g.lineWidth = px(2)
    g.stroke()
  }
}
