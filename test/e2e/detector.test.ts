import { readFileSync } from 'node:fs'
import { type Browser, chromium } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ortRuntime } from '../../site/vite-ort'
import { group } from '../../src/classes'
import { iou } from '../../src/geom'
import type { Box, Detection } from '../../src/types'

// Needs `pnpm models`. TALLY_GPU=1 also runs WebGPU, in a headed browser so the real GPU is used.
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'
const GPU = process.env.TALLY_GPU === '1'
const truth: Box[] = JSON.parse(readFileSync('test/fixtures/detrac.json', 'utf8')).vehicles.map(
  ([x1, y1, x2, y2]: number[]) => ({ x1, y1, x2, y2 }),
)

let server: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  server = await createServer({
    root: '.',
    publicDir: 'site/public',
    logLevel: 'error',
    server: { port: 0, host: '127.0.0.1' },
    plugins: [ortRuntime()],
  })
  await server.listen()
  const addr = server.httpServer?.address()
  url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/test/e2e/page.html`
  browser = await chromium.launch({
    executablePath: CHROMIUM,
    headless: !GPU,
    args: GPU
      ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist']
      : [],
  })
})

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

type Out = { ep: string; adapter: string; dets: Detection[]; ms: { infer: number } }

async function run(model: string, ep: string): Promise<Out> {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error(e))
  await page.goto(url)
  await page.waitForFunction(() => 'runDetect' in window)
  const out = (await page.evaluate(
    ([m, e]) => window.runDetect(m as never, e as never),
    [model, ep],
  )) as Out
  await page.close()
  return out
}

function matched(dets: Detection[]): number {
  const cars = dets.filter((d) => group(d.kind) === 'vehicle')
  return truth.filter((t) => cars.some((d) => iou(d, t) > 0.5)).length
}

describe('detector in the browser', () => {
  for (const model of ['yolox_nano', 'dfine_s']) {
    it(`${model} on WASM finds the labelled cars`, async () => {
      const out = await run(model, 'wasm')
      expect(out.ep).toBe('wasm')
      expect(matched(out.dets)).toBeGreaterThanOrEqual(4)
    })
  }

  it.runIf(GPU)('yolox_nano on WebGPU matches WASM', async () => {
    const gpu = await run('yolox_nano', 'webgpu')
    expect(gpu.ep).toBe('webgpu')
    console.log(`webgpu adapter ${gpu.adapter}, infer ${gpu.ms.infer.toFixed(1)} ms`)
    expect(matched(gpu.dets)).toBeGreaterThanOrEqual(4)
  })
})
