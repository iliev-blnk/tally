import { defineConfig } from 'vite'
import { ortRuntime } from './vite-ort.ts'

// Cross-origin isolation lets ONNX Runtime's WASM backend use threads. Pages can't set headers,
// so the deployed site gets them from coi-serviceworker instead.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  base: './',
  plugins: [ortRuntime()],
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
})
