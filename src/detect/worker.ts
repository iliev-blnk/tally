/// <reference lib="webworker" />
import { createDetector, type Detector, type DetectorOpts } from './session'

export type WorkerIn =
  | { type: 'init'; opts: DetectorOpts }
  | { type: 'detect'; id: number; bitmap: ImageBitmap; minScore: number }

export type WorkerOut =
  | { type: 'ready'; ep: Detector['ep']; adapter: string }
  | { type: 'result'; id: number; result: Awaited<ReturnType<Detector['detect']>> }
  | { type: 'error'; id?: number; message: string }

let detector: Detector | null = null
const post = (m: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const m = e.data
  try {
    if (m.type === 'init') {
      await detector?.dispose()
      detector = await createDetector(m.opts)
      post({ type: 'ready', ep: detector.ep, adapter: detector.adapter })
    } else {
      if (!detector) throw new Error('detector not initialised')
      const result = await detector.detect(m.bitmap, m.minScore)
      m.bitmap.close()
      post({ type: 'result', id: m.id, result })
    }
  } catch (err) {
    if (m.type === 'detect') m.bitmap.close()
    post({ type: 'error', id: m.type === 'detect' ? m.id : undefined, message: String(err) })
  }
}
