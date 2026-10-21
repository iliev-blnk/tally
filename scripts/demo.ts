// Records docs/demo.gif: the built page counting its first clip live on WebGPU, in headed
// Chromium so the real GPU is used. Compositing stays in software: with GPU compositing on, the
// laptop this was made on hands the page black video frames.
//   pnpm models && pnpm build && pnpm demo
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'
const CLIP = process.env.DEMO_CLIP ?? 'avenue'
const SECONDS = Number(process.env.DEMO_SECONDS ?? 12)
const FPS = 10
const OUT = resolve('docs/demo.gif')

const server = await preview({
  configFile: resolve('site/vite.config.ts'),
  root: 'site',
  preview: { port: 0, host: '127.0.0.1' },
  logLevel: 'error',
})
const url = server.resolvedUrls?.local[0]
if (!url) throw new Error('preview did not start')

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  headless: false,
  args: [
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-gpu-compositing',
    '--autoplay-policy=no-user-gesture-required',
  ],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 600 } })
page.on('pageerror', (e) => console.error(e))
await page.goto(`${url}#${CLIP}`)
await page.waitForFunction(() => /WebGPU/.test(document.getElementById('facts')?.textContent ?? ''))
// Start from the top of the clip, with the detector already warm.
await page.evaluate(() => {
  const v = document.querySelector('video') as HTMLVideoElement
  v.currentTime = 0
})
await page.waitForTimeout(300)

const frames = mkdtempSync(join(tmpdir(), 'tally-demo-'))
const t0 = Date.now()
for (let n = 0; n < SECONDS * FPS; n++) {
  await new Promise((ok) => setTimeout(ok, Math.max(0, t0 + (n * 1000) / FPS - Date.now())))
  await page.screenshot({
    path: join(frames, `${String(n).padStart(4, '0')}.jpg`),
    type: 'jpeg',
    quality: 92,
  })
}
process.stdout.write(`${await page.textContent('#facts')}\n`)
await browser.close()
server.httpServer.close()

mkdirSync('docs', { recursive: true })
// GIF pays for every pixel that changes, so no dithering, and a temporal denoise keeps the
// still background from shimmering between frames.
const graph = [
  'hqdn3d=0:0:12:12,scale=800:-1:flags=lanczos,split[a][b]',
  '[a]palettegen=max_colors=64:stats_mode=full[p]',
  '[b][p]paletteuse=dither=none:diff_mode=rectangle',
].join(';')
await new Promise<void>((ok, fail) => {
  const ff = spawn(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      String(FPS),
      '-i',
      join(frames, '%04d.jpg'),
      '-filter_complex',
      graph,
      '-loop',
      '0',
      OUT,
    ],
    { stdio: 'inherit' },
  )
  ff.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`))))
})
rmSync(frames, { recursive: true })
process.stdout.write(`wrote ${OUT}\n`)
