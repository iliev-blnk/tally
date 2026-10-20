import type { Box } from '../types'

// ByteTrack's constant-velocity filter over (cx, cy, aspect, height). Its matrices are
// block-diagonal per coordinate, so it is run as four independent position/velocity filters.
const POS = 1 / 20
const VEL = 1 / 160

type Axis = { p: number; v: number; pp: number; pv: number; vv: number }

export class BoxFilter {
  private axes: Axis[]

  constructor(b: Box) {
    const z = measure(b)
    const h = z[3]
    this.axes = z.map((p, i) => {
      const sp = i === 2 ? 1e-2 : 2 * POS * h
      const sv = i === 2 ? 1e-5 : 10 * VEL * h
      return { p, v: 0, pp: sp * sp, pv: 0, vv: sv * sv }
    })
  }

  /** Advances the state by `dt` frames. */
  predict(dt: number): void {
    const h = this.height()
    this.axes.forEach((a, i) => {
      const qp = (i === 2 ? 1e-2 : POS * h) ** 2 * dt
      const qv = (i === 2 ? 1e-5 : VEL * h) ** 2 * dt
      a.p += a.v * dt
      a.pp += dt * (2 * a.pv + dt * a.vv) + qp
      a.pv += dt * a.vv
      a.vv += qv
    })
  }

  update(b: Box): void {
    const z = measure(b)
    const h = this.height()
    this.axes.forEach((a, i) => {
      const r = (i === 2 ? 1e-1 : POS * h) ** 2
      const s = a.pp + r
      const kp = a.pp / s
      const kv = a.pv / s
      const y = (z[i] as number) - a.p
      a.p += kp * y
      a.v += kv * y
      const pp = a.pp
      const pv = a.pv
      a.pp = (1 - kp) * pp
      a.pv = (1 - kp) * pv
      a.vv -= kv * pv
    })
  }

  box(): Box {
    const [cx, cy, ar, h] = this.axes.map((a) => a.p) as [number, number, number, number]
    const hh = Math.max(h, 0)
    const w = Math.max(ar, 0) * hh
    return { x1: cx - w / 2, y1: cy - hh / 2, x2: cx + w / 2, y2: cy + hh / 2 }
  }

  private height(): number {
    return Math.max(this.axes[3]?.p ?? 1, 1)
  }
}

function measure(b: Box): [number, number, number, number] {
  const w = Math.max(b.x2 - b.x1, 0)
  const h = Math.max(b.y2 - b.y1, 1)
  return [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, w / h, h]
}
