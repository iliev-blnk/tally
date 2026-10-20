// Fetches the benchmark footage into $EDGE_DATA (default ~/DEV/edge-data) by reading only the
// needed members out of the remote zips with HTTP range requests.
//   tsx bench/data.ts [--check]   (--check only lists what is missing)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { inflateRawSync } from 'node:zlib'
import { DATA, DETRAC_TRAIN, MOT17 } from './datasets'

const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } })
const HF = 'https://huggingface.co/datasets/abhineet123/ua_detrac/resolve/main'

type Entry = { name: string; method: number; size: number; offset: number }

async function range(url: string, start: number, end: number): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { range: `bytes=${start}-${end - 1}` } })
      if (res.status !== 206) throw new Error(`${url}: HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      if (attempt >= 4) throw e
      await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1)))
    }
  }
}

/** Reads a remote zip's central directory, including zip64 archives. */
async function listing(url: string): Promise<Entry[]> {
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' })
  const total = Number(head.headers.get('content-length'))
  const tail = await range(url, Math.max(0, total - 65_557), total)
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error(`${url}: not a zip`)
  let cdSize = tail.readUInt32LE(eocd + 12)
  let cdOffset = tail.readUInt32LE(eocd + 16)
  const loc64 = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), eocd)
  if (loc64 >= 0) {
    const at = Number(tail.readBigUInt64LE(loc64 + 8))
    const rec = await range(url, at, at + 56)
    cdSize = Number(rec.readBigUInt64LE(40))
    cdOffset = Number(rec.readBigUInt64LE(48))
  }
  const cd = await range(url, cdOffset, cdOffset + cdSize)
  const entries: Entry[] = []
  for (let p = 0; p < cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
    const nameLen = cd.readUInt16LE(p + 28)
    const extraLen = cd.readUInt16LE(p + 30)
    const commentLen = cd.readUInt16LE(p + 32)
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen)
    let size = cd.readUInt32LE(p + 20) // compressed
    let raw = cd.readUInt32LE(p + 24)
    let offset = cd.readUInt32LE(p + 42)
    // Zip64 extra field: the 0xffffffff fields follow in order.
    for (let e = p + 46 + nameLen; e < p + 46 + nameLen + extraLen; ) {
      const id = cd.readUInt16LE(e)
      const len = cd.readUInt16LE(e + 2)
      if (id === 1) {
        let q = e + 4
        const next = () => {
          q += 8
          return Number(cd.readBigUInt64LE(q - 8))
        }
        if (raw === 0xffffffff) raw = next()
        if (size === 0xffffffff) size = next()
        if (offset === 0xffffffff) offset = next()
      }
      e += 4 + len
    }
    entries.push({ name, method: cd.readUInt16LE(p + 10), size, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function extract(url: string, out: string, prefixes: string[]) {
  const wanted = (await listing(url)).filter(
    (e) => !e.name.endsWith('/') && prefixes.some((p) => e.name.startsWith(p)),
  )
  const queue = wanted.filter((e) => !existsSync(join(out, e.name)))
  process.stdout.write(`${url}: ${wanted.length} files, ${queue.length} missing\n`)
  if (values.check) return
  let done = 0
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const local = await range(url, e.offset, e.offset + 30)
      const start = e.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
      const body = await range(url, start, start + e.size)
      const data = e.method === 8 ? inflateRawSync(body) : body
      mkdirSync(dirname(join(out, e.name)), { recursive: true })
      writeFileSync(join(out, e.name), data)
      if (++done % 500 === 0) process.stdout.write(`  ${done}/${queue.length + done}\n`)
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
}

await extract(`${HF}/ua_detrac_test_set.zip`, join(DATA, 'detrac'), [''])
await extract(
  `${HF}/ua_detrac_training_set.zip`,
  join(DATA, 'detrac-train'),
  DETRAC_TRAIN.map((s) => `${s}/`),
)
await extract(
  'https://motchallenge.net/data/MOT17.zip',
  join(DATA, 'mot17'),
  MOT17.map((s) => `MOT17/train/${s}/`),
)
