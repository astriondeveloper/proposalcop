import { describe, expect, it } from 'vitest'
import { layoutChart } from './layout'
import { normalizeChart, normalizeTable } from './model'
import { templates } from './templates'
import type { OrgChart } from './model'

const tableChart = (): OrgChart => ({
  version: 1,
  meta: { title: 'T', showTitle: true, layout: 'table' },
  roots: [{ id: 'h', title: '', variant: 'hidden' }],
  groups: [],
  comms: [],
  legend: [],
  table: {
    columns: [
      { label: 'A', align: 'left' },
      { label: 'B' },
    ],
    rows: [
      { cells: [{ text: 'a1' }, { text: 'b1', status: 'good' }] },
      { header: true, cells: [{ text: 'Section' }] },
      { cells: [{ text: 'a2' }, { text: 'b2', status: 'bad' }] },
    ],
  },
})

describe('normalizeTable', () => {
  it('coerces the shape and keeps only known statuses', () => {
    const t = normalizeTable({
      columns: [{ label: 'A' }],
      rows: [{ cells: [{ text: 'x', status: 'good' }, { text: 'y', status: 'nope' }] }],
      zebra: false,
    })
    expect(t?.columns).toHaveLength(1)
    expect(t?.rows[0].cells[0].status).toBe('good')
    expect(t?.rows[0].cells[1].status).toBeUndefined()
    expect(t?.zebra).toBe(false)
  })

  it('drops a table with no columns', () => {
    expect(normalizeTable({ columns: [] })).toBeUndefined()
    expect(normalizeTable({})).toBeUndefined()
  })

  it('survives a normalizeChart round-trip', () => {
    const chart = normalizeChart(tableChart())
    expect(chart.meta.layout).toBe('table')
    expect(chart.table?.rows).toHaveLength(3)
  })
})

describe('layoutTable', () => {
  it('produces table geometry only for the table layout', () => {
    expect(layoutChart(tableChart()).table).not.toBeNull()
    const tree: OrgChart = { ...tableChart(), meta: { title: 'T', showTitle: true } }
    expect(layoutChart(tree).table).toBeNull()
  })

  it('lays out header + rows with left-to-right columns and carries status', () => {
    const t = layoutChart(tableChart()).table!
    expect(t.columns).toHaveLength(2)
    expect(t.rows).toHaveLength(3)
    expect(t.headerH).toBeGreaterThan(0)
    expect(t.columns[1].x).toBeGreaterThan(t.columns[0].x)
    expect(t.rows[1].header).toBe(true)
    expect(t.rows[0].cells[1].status).toBe('good')
  })

  it('renders the RACI / QASP / crosswalk templates as tables', () => {
    for (const key of ['raci', 'qasp', 'crosswalk']) {
      const l = layoutChart(templates.find((t) => t.key === key)!.build())
      expect(l.table, key).not.toBeNull()
      expect(l.table!.rows.length).toBeGreaterThan(0)
    }
  })
})
