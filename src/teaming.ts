import type { OrgChart } from './model'
import { visit } from './model'

/* Teaming / workshare helpers — pure functions over the chart model. Workshare
 * is read from the freeform "Workshare" detail rows the teaming template uses
 * (e.g. "20%"), so no model change is needed and any teaming chart following the
 * same convention rolls up automatically. */

export interface WorkshareEntry {
  id: string
  title: string
  percent: number
}

export interface WorkshareRollup {
  entries: WorkshareEntry[]
  total: number
  /** Whether the total balances to 100% (within a small tolerance). */
  balanced: boolean
}

/** Parse a percentage out of a detail-row value like "20%", "20", or "12.5 %". */
export function parsePercent(text: string): number | null {
  const m = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

/** Sum workshare across every box carrying a "Workshare" detail row. */
export function workshareRollup(chart: OrgChart): WorkshareRollup {
  const entries: WorkshareEntry[] = []
  visit(chart.roots, (n) => {
    for (const d of n.details ?? []) {
      if (!/workshare/i.test(d.label)) continue
      const p = parsePercent(d.text)
      if (p !== null) {
        entries.push({ id: n.id, title: n.title || '(untitled)', percent: p })
        break // one workshare row per box
      }
    }
  })
  const total = Math.round(entries.reduce((s, e) => s + e.percent, 0) * 10) / 10
  return { entries, total, balanced: entries.length > 0 && Math.abs(total - 100) < 0.05 }
}
