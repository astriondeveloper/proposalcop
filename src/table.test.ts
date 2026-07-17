import { describe, expect, it } from 'vitest'
import { layoutChart } from './layout'
import {
  emptyTable,
  normalizeChart,
  normalizeTable,
  tableAddColumn,
  tableAddRow,
  tableMoveColumn,
  tableMoveRow,
  tableRemoveColumn,
  tableRemoveRow,
} from './model'
import { templates } from './templates'
import type { OrgChart, TableDef } from './model'

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

describe('table editing helpers', () => {
  const base = (): TableDef => ({
    columns: [{ label: 'A', align: 'left' }, { label: 'B' }, { label: 'C' }],
    rows: [
      { cells: [{ text: 'a1' }, { text: 'b1', status: 'good' }, { text: 'c1' }] },
      { header: true, cells: [{ text: 'Section' }] },
      { cells: [{ text: 'a2' }, { text: 'b2' }, { text: 'c2' }] },
    ],
  })

  it('adds a column with an empty cell in every data row, skipping headers', () => {
    const t = tableAddColumn(base())
    expect(t.columns).toHaveLength(4)
    expect(t.rows[0].cells).toHaveLength(4)
    expect(t.rows[0].cells[3].text).toBe('')
    expect(t.rows[1].cells).toHaveLength(1) // section header untouched
  })

  it('inserts a column mid-table, shifting data cells', () => {
    const t = tableAddColumn(base(), 1)
    expect(t.rows[0].cells.map((c) => c.text)).toEqual(['a1', '', 'b1', 'c1'])
  })

  it('removes a column and its cells, refusing to drop the last column', () => {
    const t = tableRemoveColumn(base(), 1)
    expect(t.columns.map((c) => c.label)).toEqual(['A', 'C'])
    expect(t.rows[0].cells.map((c) => c.text)).toEqual(['a1', 'c1'])
    let one = base()
    one = tableRemoveColumn(tableRemoveColumn(one, 2), 1)
    expect(tableRemoveColumn(one, 0)).toBe(one)
  })

  it('moves a column together with its data cells (status travels too)', () => {
    const t = tableMoveColumn(base(), 1, -1)
    expect(t.columns.map((c) => c.label)).toEqual(['B', 'A', 'C'])
    expect(t.rows[0].cells[0].text).toBe('b1')
    expect(t.rows[0].cells[0].status).toBe('good')
    const b = base()
    expect(tableMoveColumn(b, 0, -1)).toBe(b) // out of range: unchanged
  })

  it('pads short data rows before positional edits so cells stay aligned', () => {
    const t = base()
    t.rows[2].cells = [{ text: 'a2' }] // short row, e.g. from imported JSON
    const moved = tableMoveColumn(t, 0, 1)
    expect(moved.rows[2].cells.map((c) => c.text)).toEqual(['', 'a2', ''])
  })

  it('adds, moves, and removes rows (section rows keep one cell)', () => {
    let t = tableAddRow(base())
    expect(t.rows).toHaveLength(4)
    expect(t.rows[3].cells).toHaveLength(3)
    t = tableAddRow(t, t.rows.length, true)
    expect(t.rows[4].header).toBe(true)
    expect(t.rows[4].cells).toHaveLength(1)
    t = tableMoveRow(t, 4, -1)
    expect(t.rows[3].header).toBe(true)
    t = tableRemoveRow(t, 3)
    expect(t.rows).toHaveLength(4)
    expect(tableMoveRow(t, 0, -1)).toBe(t)
  })

  it('provides a valid starter table that survives normalization', () => {
    const t = normalizeTable(emptyTable())
    expect(t?.columns.length).toBeGreaterThan(1)
    expect(t?.rows.length).toBeGreaterThan(0)
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
