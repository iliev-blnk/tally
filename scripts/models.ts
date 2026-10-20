// Downloads the detector models and ONNX Runtime's wasm runtime into site/public.
//   pnpm models
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { MODEL_IDS, MODELS } from '../src/detect/models'

const pub = join(import.meta.dirname, '../site/public')
mkdirSync(join(pub, 'models'), { recursive: true })
mkdirSync(join(pub, 'ort'), { recursive: true })

const ortDist = dirname(createRequire(import.meta.url).resolve('onnxruntime-web/webgpu'))
// The WebGPU bundle loads only the asyncify build, for both its WebGPU and WASM backends.
for (const f of readdirSync(ortDist)) {
  if (/^ort-wasm-simd-threaded\.asyncify\.(wasm|mjs)$/.test(f))
    copyFileSync(join(ortDist, f), join(pub, 'ort', f))
}

for (const id of MODEL_IDS) {
  const out = join(pub, 'models', `${id}.onnx`)
  if (existsSync(out)) continue
  const res = await fetch(MODELS[id].url)
  if (!res.ok) throw new Error(`${id}: ${res.status} ${res.statusText}`)
  writeFileSync(out, new Uint8Array(await res.arrayBuffer()))
  process.stdout.write(`${id}.onnx\n`)
}
