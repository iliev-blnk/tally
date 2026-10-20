import { KINDS } from '../../src/classes'
import type { ModelId } from '../../src/detect/models'
import { type Backend, createDetector, type Detector } from '../../src/detect/session'
import type { Detection } from '../../src/types'

// Detects every frame of a sequence and posts the packed result back to the bench server.
declare global {
  interface Window {
    load(model: ModelId, ep: Backend, power?: GPUPowerPreference): Promise<string>
    detectSeq(frames: string[], out: string, minScore: number): Promise<number>
    speed(frames: string[]): Promise<number[]>
  }
}

let detector: Detector | null = null

window.load = async (model, ep, power) => {
  await detector?.dispose()
  detector = await createDetector({ model, ep, baseUrl: '/', power })
  return `${detector.ep} ${detector.adapter}`
}

const bitmap = async (url: string) => createImageBitmap(await (await fetch(url)).blob())

/** u32 count, then count × (f32 x1, y1, x2, y2, score, u8 kind), per frame. */
function pack(frames: Detection[][]): ArrayBuffer {
  const bytes = frames.reduce((n, d) => n + 4 + d.length * 21, 0)
  const view = new DataView(new ArrayBuffer(bytes))
  let p = 0
  for (const dets of frames) {
    view.setUint32(p, dets.length, true)
    p += 4
    for (const d of dets) {
      for (const v of [d.x1, d.y1, d.x2, d.y2, d.score]) {
        view.setFloat32(p, v, true)
        p += 4
      }
      view.setUint8(p++, KINDS.indexOf(d.kind))
    }
  }
  return view.buffer
}

window.detectSeq = async (frames, out, minScore) => {
  if (!detector) throw new Error('call load first')
  const all: Detection[][] = []
  const t0 = performance.now()
  // Decode the next frame while the current one is on the detector.
  let next = bitmap(frames[0] as string)
  for (let i = 0; i < frames.length; i++) {
    const bmp = await next
    if (i + 1 < frames.length) next = bitmap(frames[i + 1] as string)
    all.push((await detector.detect(bmp, minScore)).dets)
    bmp.close()
  }
  const res = await fetch(out, { method: 'POST', body: pack(all) })
  if (!res.ok) throw new Error(`POST ${out}: ${res.status}`)
  return (performance.now() - t0) / frames.length
}

/** Per-frame wall time of preprocess + inference + decode, frames already decoded. */
window.speed = async (frames) => {
  if (!detector) throw new Error('call load first')
  const bmps = await Promise.all(frames.map(bitmap))
  const ms: number[] = []
  for (const b of bmps) {
    const t = performance.now()
    await detector.detect(b, 0.3)
    ms.push(performance.now() - t)
  }
  for (const b of bmps) b.close()
  return ms
}
