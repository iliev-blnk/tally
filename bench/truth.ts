// Prints each sequence's counting line and label-derived counts.
//   tsx bench/truth.ts --split tune|report
import { parseArgs } from 'node:util'
import { loadSequences, type Split } from './datasets'
import { lineFor, truthCounts } from './lines'

const { values } = parseArgs({ options: { split: { type: 'string', default: 'report' } } })
let total = 0
for (const s of loadSequences(values.split as Split)) {
  const line = lineFor(s)
  const c = truthCounts(s, line)
  total += c.in + c.out
  const at = line.a[1] === line.b[1] ? `y=${line.a[1]}` : `x=${Math.round(line.a[0])}`
  process.stdout.write(`${s.id.padEnd(22)} ${at.padEnd(7)} in ${c.in}  out ${c.out}\n`)
}
process.stdout.write(`total ${total}\n`)
