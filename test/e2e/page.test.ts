import { resolve } from 'node:path'
import { type Browser, chromium, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, it } from 'vitest'

// The page on its first bundled clip, detector on WASM in headless Chromium. Needs `pnpm models`.
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'

let server: ViteDevServer
let browser: Browser
let page: Page

beforeAll(async () => {
  server = await createServer({
    configFile: resolve('site/vite.config.ts'),
    root: 'site',
    logLevel: 'error',
    server: { port: 0, host: '127.0.0.1' },
  })
  await server.listen()
  browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (e) => console.error(e))
  await page.goto(`${server.resolvedUrls?.local[0]}?model=yolox_nano&ep=wasm#junction`)
  await page.waitForFunction(() =>
    /analysed/.test(document.getElementById('facts')?.textContent ?? ''),
  )
  await page.waitForTimeout(5000)
})

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

const cells = (row: string) =>
  page.$$eval(`#counts tr.${row} td`, (tds) => tds.map((td) => Number(td.textContent)))

it('analyses frames on WASM', async () => {
  const facts = await page.textContent('#facts')
  expect(facts).toMatch(/YOLOX-nano · WASM/)
  expect(Number(/(\d+) of \d+ frames/.exec(facts ?? '')?.[1])).toBeGreaterThan(10)
})

it('draws boxes over the footage', async () => {
  const boxes = await page.$eval('#overlay', (c) => {
    const g = (c as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D
    const { data } = g.getImageData(0, 0, (c as HTMLCanvasElement).width, 540)
    // Pure white pixels: vehicle box outlines (the line is yellow, zones are translucent).
    let n = 0
    for (let i = 0; i < data.length; i += 4)
      if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) n++
    return n
  })
  expect(boxes).toBeGreaterThan(200)
})

it('counts against the labels and restarts both when a new line is drawn', async () => {
  await page.waitForFunction(() => {
    const t = [...document.querySelectorAll('#counts tr.truth td')]
    return t.reduce((n, td) => n + Number(td.textContent), 0) > 0
  })
  const box = await page.locator('#overlay').boundingBox()
  if (!box) throw new Error('no overlay')
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.7)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.7, { steps: 5 })
  await page.mouse.up()
  expect(await cells('total')).toEqual([0, 0])
  expect(await cells('truth')).toEqual([0, 0])
  const arrows = await page.$$eval('#counts thead th', (th) => th.map((t) => t.textContent))
  expect(arrows).toEqual(['↓', '↑'])
})
