import type { OrgChart } from './model'
import { visit } from './model'

/* Teaming / workshare helpers — pure functions over the chart model. Workshare
 * and socioeconomic category are read from the freeform detail rows the teaming
 * template uses ("Workshare: 20%", "Category: SDVOSB"), so no model change is
 * needed and any teaming chart following the convention rolls up automatically. */

export type SocioCategory = 'Small Business' | '8(a)' | 'SDVOSB' | 'WOSB' | 'HUBZone' | 'Other'

/** Display order for socioeconomic categories. */
const SOCIO_ORDER: SocioCategory[] = ['Small Business', '8(a)', 'SDVOSB', 'WOSB', 'HUBZone', 'Other']

export interface WorkshareEntry {
  id: string
  title: string
  percent: number
  category: SocioCategory
}

export interface SocioBreakdown {
  category: SocioCategory
  percent: number
}

export interface WorkshareRollup {
  entries: WorkshareEntry[]
  total: number
  /** Whether the total balances to 100% (within a small tolerance). */
  balanced: boolean
  /** Workshare summed per declared socioeconomic category. */
  byCategory: SocioBreakdown[]
  /** Workshare across every small-business category (everything but 'Other'). */
  smallBusinessTotal: number
}

/** Parse a percentage out of a detail-row value like "20%", "20", or "12.5 %". */
export function parsePercent(text: string): number | null {
  const m = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

/** Map a free-text set-aside / category value to a canonical socioeconomic
 *  category, defaulting to 'Other' (e.g. a large business or the prime). */
export function parseSocio(text: string): SocioCategory {
  const t = text.toLowerCase()
  if (/8\s*\(?\s*a\s*\)?/.test(t)) return '8(a)'
  if (/sdvosb|service.?disabled/.test(t)) return 'SDVOSB'
  if (/wosb|women|woman/.test(t)) return 'WOSB'
  if (/hubzone/.test(t)) return 'HUBZone'
  if (/small\s*business|\bsb\b/.test(t)) return 'Small Business'
  return 'Other'
}

/** Sum workshare across every box carrying a "Workshare" detail row, with a
 *  socioeconomic breakdown from each box's "Category" / "Set-aside" row. */
export function workshareRollup(chart: OrgChart): WorkshareRollup {
  const entries: WorkshareEntry[] = []
  visit(chart.roots, (n) => {
    let percent: number | null = null
    let category: SocioCategory = 'Other'
    for (const d of n.details ?? []) {
      if (percent === null && /workshare/i.test(d.label)) percent = parsePercent(d.text)
      if (/category|set.?aside|socio/i.test(d.label)) category = parseSocio(d.text)
    }
    if (percent !== null) {
      entries.push({ id: n.id, title: n.title || '(untitled)', percent, category })
    }
  })

  const total = Math.round(entries.reduce((s, e) => s + e.percent, 0) * 10) / 10

  const catMap = new Map<SocioCategory, number>()
  for (const e of entries) catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.percent)
  const round = (v: number) => Math.round(v * 10) / 10
  const byCategory = SOCIO_ORDER.filter((c) => catMap.has(c)).map((c) => ({
    category: c,
    percent: round(catMap.get(c) ?? 0),
  }))
  const smallBusinessTotal = round(
    entries.filter((e) => e.category !== 'Other').reduce((s, e) => s + e.percent, 0),
  )

  return {
    entries,
    total,
    balanced: entries.length > 0 && Math.abs(total - 100) < 0.05,
    byCategory,
    smallBusinessTotal,
  }
}
