import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { type Browser, chromium, type Page } from 'playwright-core'
import { build } from 'vite'
import type { ModelId } from '../src/detect/models'
import type { Backend } from '../src/detect/session'
import { DATA } from './datasets'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'bench/.detect-dist')
export const CACHE = join(ROOT, 'bench/.cache')
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.jpg': 'image/jpeg',
}

/** A frame's URL on the bench server. */
export const frameUrl = (path: string) => `/data/${path.slice(DATA.length + 1)}`

function serve(): Promise<{ server: Server; base: string }> {
  // Cross-origin isolated, so ONNX Runtime's WASM backend can use threads.
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    if (req.method === 'POST' && url.startsWith('/cache/')) {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        const file = join(CACHE, normalize(url.slice('/cache/'.length)))
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, Buffer.concat(chunks))
        res.end('ok')
      })
      return
    }
    let file: string
    if (url.startsWith('/data/')) file = join(DATA, normalize(url.slice(6)))
    else if (/^\/(models|ort)\//.test(url)) file = join(ROOT, 'site/public', normalize(url))
    else file = join(DIST, normalize(url === '/' ? '/index.html' : url))
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404
      res.end()
      return
    }
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
    createReadStream(file).pipe(res)
  })
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      ok({ server, base: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}` })
    }),
  )
}

export type BenchPage = {
  page: Page
  browserVersion: string
  load(model: ModelId, ep: Backend, power?: GPUPowerPreference): Promise<string>
  close(): Promise<void>
}

/** Builds the bench page and opens it. WebGPU needs a headed browser to get the real GPU. */
export async function openBench(gpu: boolean): Promise<BenchPage> {
  await build({
    root: join(ROOT, 'bench/detect-page'),
    publicDir: false,
    logLevel: 'error',
    build: { outDir: DIST, emptyOutDir: true },
  })
  const { server, base } = await serve()
  const browser: Browser = await chromium.launch({
    executablePath: CHROMIUM,
    headless: !gpu,
    args: gpu
      ? [
          '--enable-unsafe-webgpu',
          '--enable-features=Vulkan',
          '--ignore-gpu-blocklist',
          '--window-size=480,320',
        ]
      : [],
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error(e))
  await page.goto(`${base}/`)
  await page.waitForFunction(() => 'load' in window)
  return {
    page,
    load: (model, ep, power) =>
      page.evaluate(([m, e, p]) => window.load(m, e, p), [model, ep, power] as const),
    browserVersion: browser.version(),
    async close() {
      await browser.close()
      server.close()
    },
  }
}
