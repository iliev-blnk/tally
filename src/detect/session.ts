import * as ort from 'onnxruntime-web/webgpu'
import type { Detection } from '../types'
import { decodeDetr } from './detr'
import { MODELS, type ModelId } from './models'
import { decodeYolox, letterbox } from './yolox'

export type Backend = 'webgpu' | 'wasm'

export type DetectorOpts = {
  model: ModelId
  ep: Backend | 'auto'
  /** Site root holding `models/<id>.onnx` and `ort/*.wasm`. */
  baseUrl: string
  /** WebGPU adapter preference, for benchmarking the integrated GPU. */
  power?: GPUPowerPreference
}

export type Timing = { pre: number; infer: number; post: number }

export type DetectResult = { dets: Detection[]; ms: Timing }

export type Detector = {
  ep: Backend
  model: ModelId
  adapter: string
  detect(src: ImageBitmap, minScore: number): Promise<DetectResult>
  dispose(): Promise<void>
}

async function gpuAdapter(power?: GPUPowerPreference): Promise<GPUAdapter | null> {
  try {
    return (await navigator.gpu?.requestAdapter({ powerPreference: power })) ?? null
  } catch {
    return null
  }
}

/** Loads a model on WebGPU when the device has it, otherwise on WASM. */
export async function createDetector(opts: DetectorOpts): Promise<Detector> {
  ort.env.wasm.wasmPaths = `${opts.baseUrl}ort/`
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency || 1)
    : 1
  const info = MODELS[opts.model]
  const url = `${opts.baseUrl}models/${opts.model}.onnx`
  let session: ort.InferenceSession | null = null
  let ep: Backend = 'wasm'
  let adapter = 'cpu'
  if (opts.ep !== 'wasm') {
    const a = await gpuAdapter(opts.power)
    if (a) {
      try {
        ort.env.webgpu.adapter = a
        session = await ort.InferenceSession.create(url, {
          executionProviders: ['webgpu'],
          graphOptimizationLevel: 'all',
        })
        ep = 'webgpu'
        adapter = [a.info.vendor, a.info.architecture].filter(Boolean).join(' ') || 'gpu'
      } catch (e) {
        if (opts.ep === 'webgpu') throw e
      }
    } else if (opts.ep === 'webgpu') throw new Error('WebGPU is not available')
  }
  session ??= await ort.InferenceSession.create(url, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
  const s = session
  const S = info.size
  const canvas = new OffscreenCanvas(S, S)
  // GPU-backed canvases read back as zeros on some Chromium/Vulkan builds; force a CPU canvas.
  const g = canvas.getContext('2d', { willReadFrequently: true })
  if (!g) throw new Error('2D canvas unavailable')
  const input = new Float32Array(3 * S * S)
  const plane = S * S

  return {
    ep,
    model: opts.model,
    adapter,
    async detect(src, minScore) {
      const t0 = performance.now()
      const W = src.width
      const H = src.height
      let r = 1
      if (info.family === 'yolox') {
        r = letterbox(W, H, S).r
        g.fillStyle = 'rgb(114,114,114)'
        g.fillRect(0, 0, S, S)
        g.drawImage(src, 0, 0, W * r, H * r)
      } else g.drawImage(src, 0, 0, S, S)
      const px = g.getImageData(0, 0, S, S).data
      if (info.family === 'yolox') {
        // BGR, 0–255.
        for (let i = 0; i < plane; i++) {
          input[i] = px[i * 4 + 2] as number
          input[plane + i] = px[i * 4 + 1] as number
          input[2 * plane + i] = px[i * 4] as number
        }
      } else {
        // RGB, 0–1.
        for (let i = 0; i < plane; i++) {
          input[i] = (px[i * 4] as number) / 255
          input[plane + i] = (px[i * 4 + 1] as number) / 255
          input[2 * plane + i] = (px[i * 4 + 2] as number) / 255
        }
      }
      const tensor = new ort.Tensor('float32', input, [1, 3, S, S])
      const t1 = performance.now()
      const out = await s.run({ [s.inputNames[0] as string]: tensor })
      const t2 = performance.now()
      let dets: Detection[]
      if (info.family === 'yolox') {
        dets = decodeYolox(out.output?.data as Float32Array, S, r, minScore)
      } else {
        dets = decodeDetr(
          out.logits?.data as Float32Array,
          out.pred_boxes?.data as Float32Array,
          W,
          H,
          minScore,
        )
      }
      for (const t of Object.values(out)) t.dispose()
      return { dets, ms: { pre: t1 - t0, infer: t2 - t1, post: performance.now() - t2 } }
    },
    async dispose() {
      await s.release()
    },
  }
}
