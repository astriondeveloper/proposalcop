import { describe, expect, it } from 'vitest'
import { layoutChart } from './layout'
import { normalizeChart, normalizeRisk, riskLevel } from './model'
import { templates } from './templates'
import type { OrgChart } from './model'

const riskChart = (): OrgChart => ({
  version: 1,
  meta: { title: 'Risks', showTitle: true, layout: 'risk' },
  roots: [{ id: 'h', title: '', variant: 'hidden' }],
  groups: [],
  comms: [],
  legend: [],
  risk: {
    risks: [
      { id: 'r1', title: 'Staffing shortfall', likelihood: 4, consequence: 4, residual: { likelihood: 2, consequence: 3 } },
      { id: 'r2', title: 'Schedule slip', likelihood: 4, consequence: 4 },
      { id: 'r3', code: 'X9', title: 'Cyber finding', likelihood: 1, consequence: 5 },
    ],
  },
})

describe('riskLevel', () => {
  it('follows the standard 5×5 matrix at the corners and center', () => {
    expect(riskLevel(1, 1)).toBe('low')
    expect(riskLevel(5, 5)).toBe('high')
    expect(riskLevel(3, 3)).toBe('moderate')
    expect(riskLevel(1, 5)).toBe('moderate')
    expect(riskLevel(5, 1)).toBe('moderate')
  })

  it('clamps out-of-range positions instead of crashing', () => {
    expect(riskLevel(0, -3)).toBe('low')
    expect(riskLevel(9, 9)).toBe('high')
  })
})

describe('normalizeRisk', () => {
  it('clamps positions to integers 1–5 and validates residuals', () => {
    const cube = normalizeRisk({
      risks: [
        { title: 'A', likelihood: 7.4, consequence: 0, residual: { likelihood: 2.6, consequence: 2 } },
        { title: 'B', likelihood: 3, consequence: 3, residual: { likelihood: 'x', consequence: 2 } },
      ],
    })!
    expect(cube.risks[0].likelihood).toBe(5)
    expect(cube.risks[0].consequence).toBe(1)
    expect(cube.risks[0].residual).toEqual({ likelihood: 3, consequence: 2 })
    expect(cube.risks[1].residual).toBeUndefined()
    expect(cube.risks[0].id).toBeTruthy()
  })

  it('drops entries without numeric positions and junk input', () => {
    const cube = normalizeRisk({ risks: [{ title: 'no numbers' }, null, 42] })!
    expect(cube.risks).toHaveLength(0)
    expect(normalizeRisk(null)).toBeUndefined()
    expect(normalizeRisk({})).toBeUndefined()
  })

  it('survives a normalizeChart round-trip with axis labels', () => {
    const c = riskChart()
    c.risk!.xLabel = 'Impact'
    const chart = normalizeChart(c)
    expect(chart.meta.layout).toBe('risk')
    expect(chart.risk?.risks).toHaveLength(3)
    expect(chart.risk?.xLabel).toBe('Impact')
  })
})

describe('layoutRisk', () => {
  it('produces risk geometry only for the risk layout', () => {
    expect(layoutChart(riskChart()).risk).not.toBeNull()
    const tree: OrgChart = { ...riskChart(), meta: { title: 'Risks', showTitle: true } }
    expect(layoutChart(tree).risk).toBeNull()
  })

  it('builds all 25 cells with matrix-matching severity tints', () => {
    const rc = layoutChart(riskChart()).risk!
    expect(rc.cells).toHaveLength(25)
    for (const cell of rc.cells) {
      expect(cell.level).toBe(riskLevel(cell.row, cell.col))
    }
    // Likelihood 5 renders at the top, likelihood 1 at the bottom.
    const top = rc.cells.find((c) => c.row === 5 && c.col === 1)!
    const bottom = rc.cells.find((c) => c.row === 1 && c.col === 1)!
    expect(top.y).toBeLessThan(bottom.y)
  })

  it('places each marker inside its (likelihood, consequence) cell', () => {
    const rc = layoutChart(riskChart()).risk!
    const m = rc.markers.find((x) => x.id === 'r3')!
    const cell = rc.cells.find((c) => c.row === 1 && c.col === 5)!
    expect(m.cx).toBeGreaterThan(cell.x)
    expect(m.cx).toBeLessThan(cell.x + rc.cellSize)
    expect(m.cy).toBeGreaterThan(cell.y)
    expect(m.cy).toBeLessThan(cell.y + rc.cellSize)
  })

  it('spreads markers sharing a cell so they never coincide', () => {
    const rc = layoutChart(riskChart()).risk!
    const [a, b] = [rc.markers[0], rc.markers[1]] // both at L4 C4
    expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThan(10)
  })

  it('carries residual positions and levels for the mitigation arrow', () => {
    const rc = layoutChart(riskChart()).risk!
    const m = rc.markers.find((x) => x.id === 'r1')!
    expect(m.residual).toBeDefined()
    expect(m.residual!.level).toBe(riskLevel(2, 3))
    expect(rc.markers.find((x) => x.id === 'r2')!.residual).toBeUndefined()
  })

  it('auto-numbers codes in register order, honoring explicit codes', () => {
    const rc = layoutChart(riskChart()).risk!
    expect(rc.markers.map((m) => m.code)).toEqual(['R1', 'R2', 'X9'])
  })

  it('lists every risk in the register panel with its move', () => {
    const rc = layoutChart(riskChart()).risk!
    expect(rc.panel).not.toBeNull()
    expect(rc.panel!.rows).toHaveLength(3)
    expect(rc.panel!.rows[0].move).toBe('L4·C4 → L2·C3')
    expect(rc.panel!.rows[1].move).toBe('L4·C4')
  })

  it('renders the risk-cube template', () => {
    const l = layoutChart(templates.find((t) => t.key === 'risk-cube')!.build())
    expect(l.risk).not.toBeNull()
    expect(l.risk!.markers.length).toBeGreaterThan(3)
    expect(l.risk!.markers.every((m) => m.residual)).toBe(true)
  })
})
