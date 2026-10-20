import type { DetectorOpts, DetectResult } from './session'
import type { WorkerIn, WorkerOut } from './worker'

/** Runs a detector in a module worker; one frame in flight at a time. */
export class DetectorClient {
  busy = false
  private seq = 0
  private pending = new Map<number, { ok: (r: DetectResult) => void; fail: (e: Error) => void }>()

  private constructor(
    private worker: Worker,
    readonly ep: 'webgpu' | 'wasm',
    readonly adapter: string,
    readonly model: DetectorOpts['model'],
  ) {
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data
      if (m.type === 'ready' || m.id === undefined) return
      const p = this.pending.get(m.id)
      this.pending.delete(m.id)
      this.busy = this.pending.size > 0
      if (m.type === 'result') p?.ok(m.result)
      else p?.fail(new Error(m.message))
    }
  }

  static create(opts: DetectorOpts): Promise<DetectorClient> {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    return new Promise((ok, fail) => {
      worker.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data
        if (m.type === 'ready') ok(new DetectorClient(worker, m.ep, m.adapter, opts.model))
        else if (m.type === 'error') {
          worker.terminate()
          fail(new Error(m.message))
        }
      }
      worker.postMessage({ type: 'init', opts } satisfies WorkerIn)
    })
  }

  /** Transfers the bitmap to the worker; it is closed there. */
  detect(bitmap: ImageBitmap, minScore: number): Promise<DetectResult> {
    const id = ++this.seq
    this.busy = true
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail })
      this.worker.postMessage({ type: 'detect', id, bitmap, minScore } satisfies WorkerIn, [bitmap])
    })
  }

  dispose(): void {
    this.worker.terminate()
    for (const p of this.pending.values()) p.fail(new Error('disposed'))
    this.pending.clear()
  }
}
