import { describe, expect, it } from 'vitest'
import { parsePercent, parseSocio, workshareRollup } from './teaming'
import type { OrgChart, OrgNode } from './model'

const node = (id: string, details?: OrgNode['details'], children?: OrgNode[]): OrgNode => ({
  id,
  title: id,
  variant: 'secondary',
  ...(details ? { details } : {}),
  ...(children ? { children } : {}),
})

const chartOf = (roots: OrgNode[]): OrgChart => ({
  version: 1,
  meta: { title: 'T', showTitle: true },
  roots,
  groups: [],
  comms: [],
  legend: [],
})

describe('parsePercent', () => {
  it('reads a number out of common formats', () => {
    expect(parsePercent('20%')).toBe(20)
    expect(parsePercent('12.5 %')).toBe(12.5)
    expect(parsePercent('55')).toBe(55)
    expect(parsePercent('n/a')).toBeNull()
  })
})

describe('workshareRollup', () => {
  it('sums workshare across boxes and flags a balanced total', () => {
    const chart = chartOf([
      node('Prime', [{ label: 'Workshare:', text: '55%' }], [
        node('Sub A', [{ label: 'Workshare:', text: '25%' }]),
        node('Sub B', [{ label: 'Workshare:', text: '20%' }]),
      ]),
    ])
    const r = workshareRollup(chart)
    expect(r.entries).toHaveLength(3)
    expect(r.total).toBe(100)
    expect(r.balanced).toBe(true)
  })

  it('flags an unbalanced total', () => {
    const chart = chartOf([
      node('Prime', [{ label: 'Workshare:', text: '60%' }]),
      node('Sub', [{ label: 'Workshare:', text: '25%' }]),
    ])
    const r = workshareRollup(chart)
    expect(r.total).toBe(85)
    expect(r.balanced).toBe(false)
  })

  it('ignores non-workshare detail rows and boxes without one', () => {
    const chart = chartOf([
      node('a', [{ label: 'Role:', text: 'Lead' }]),
      node('b'),
    ])
    const r = workshareRollup(chart)
    expect(r.entries).toHaveLength(0)
    expect(r.balanced).toBe(false)
  })

  it('reads the teaming template as a partial (subs only) total', () => {
    // The template's prime is 55 and subs 20/12/8/5 → 100 when all counted.
    const chart = chartOf([
      node('Prime', [{ label: 'Workshare:', text: '55%' }], [
        node('A', [{ label: 'Workshare:', text: '20%' }]),
        node('B', [{ label: 'Workshare:', text: '12%' }]),
        node('C', [{ label: 'Workshare:', text: '8%' }]),
        node('D', [{ label: 'Workshare:', text: '5%' }]),
      ]),
    ])
    expect(workshareRollup(chart).total).toBe(100)
  })
})

describe('parseSocio', () => {
  it('maps common set-aside strings to canonical categories', () => {
    expect(parseSocio('8(a)')).toBe('8(a)')
    expect(parseSocio('SDVOSB')).toBe('SDVOSB')
    expect(parseSocio('Woman-Owned Small Business')).toBe('WOSB')
    expect(parseSocio('HUBZone')).toBe('HUBZone')
    expect(parseSocio('Small Business')).toBe('Small Business')
    expect(parseSocio('Large Business')).toBe('Other')
  })
})

describe('workshareRollup socioeconomic breakdown', () => {
  it('categorizes workshare and totals small-business participation', () => {
    const chart = chartOf([
      node('Prime', [{ label: 'Workshare:', text: '60%' }, { label: 'Category:', text: 'Large Business' }]),
      node('B', [{ label: 'Workshare:', text: '15%' }, { label: 'Set-aside:', text: 'SDVOSB' }]),
      node('C', [{ label: 'Workshare:', text: '25%' }, { label: 'Category:', text: '8(a)' }]),
    ])
    const r = workshareRollup(chart)
    expect(r.total).toBe(100)
    expect(r.smallBusinessTotal).toBe(40)
    expect(r.byCategory).toEqual([
      { category: '8(a)', percent: 25 },
      { category: 'SDVOSB', percent: 15 },
      { category: 'Other', percent: 60 },
    ])
    expect(r.entries.find((e) => e.id === 'B')?.category).toBe('SDVOSB')
  })
})
