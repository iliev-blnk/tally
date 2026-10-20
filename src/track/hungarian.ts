/**
 * Minimum-cost assignment (Kuhn–Munkres with potentials, O(n²m)).
 * Returns the assigned column for each row, or -1 when there are more rows than columns.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length
  const m = cost[0]?.length ?? 0
  if (n === 0) return []
  if (m === 0) return new Array(n).fill(-1)
  if (n > m) {
    const t = Array.from({ length: m }, (_, j) => cost.map((row) => row[j] ?? 0))
    const cols = hungarian(t)
    const rows = new Array<number>(n).fill(-1)
    cols.forEach((i, j) => {
      if (i >= 0) rows[i] = j
    })
    return rows
  }
  // 1-indexed potentials u (rows), v (columns); p[j] is the row matched to column j.
  const u = new Float64Array(n + 1)
  const v = new Float64Array(m + 1)
  const p = new Int32Array(m + 1)
  const way = new Int32Array(m + 1)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Float64Array(m + 1).fill(Infinity)
    const used = new Uint8Array(m + 1)
    do {
      used[j0] = 1
      const i0 = p[j0] as number
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue
        const cur = (cost[i0 - 1]?.[j - 1] ?? 0) - (u[i0] as number) - (v[j] as number)
        if (cur < (minv[j] as number)) {
          minv[j] = cur
          way[j] = j0
        }
        if ((minv[j] as number) < delta) {
          delta = minv[j] as number
          j1 = j
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j] as number] = (u[p[j] as number] as number) + delta
          v[j] = (v[j] as number) - delta
        } else minv[j] = (minv[j] as number) - delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0] as number
      p[j0] = p[j1] as number
      j0 = j1
    } while (j0)
  }
  const rows = new Array<number>(n).fill(-1)
  for (let j = 1; j <= m; j++) if ((p[j] as number) > 0) rows[(p[j] as number) - 1] = j - 1
  return rows
}
