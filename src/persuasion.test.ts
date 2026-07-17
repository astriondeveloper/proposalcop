import { describe, expect, it } from 'vitest'
import { layoutChart } from './layout'
import { normalizeChart, normalizeQuote, normalizeStats } from './model'
import { templates } from './templates'
import type { OrgChart } from './model'

const baseChart = (): OrgChart => ({
  version: 1,
  meta: { title: 'P', showTitle: true },
  roots: [{ id: 'a', title: 'Box', variant: 'primary' }],
  groups: [],
  comms: [],
  legend: [],
})

const adorned = (): OrgChart => {
  const c = baseChart()
  c.meta.winTheme = 'Zero-gap transition with a funded burn-down for every risk.'
  c.meta.stats = [
    { value: '180+', label: 'cleared staff', icon: 'people' },
    { value: '99.9%', label: 'availability' },
  ]
  c.meta.quote = { text: 'Exceeded every standard.', source: 'CPARS, FY24' }
  c.meta.caption = 'Action caption below everything.'
  return c
}

describe('normalizeStats / normalizeQuote', () => {
  it('keeps items with any text, drops junk and unknown icons', () => {
    const stats = normalizeStats([
      { value: '42', label: 'things', icon: 'people' },
      { value: '', label: '', icon: 'star' },
      { value: '7', label: 'ok', icon: 'sparkles' },
      null,
      'junk',
    ])!
    expect(stats).toHaveLength(2)
    expect(stats[0].icon).toBe('people')
    expect(stats[1].icon).toBeUndefined()
    expect(normalizeStats([])).toBeUndefined()
    expect(normalizeStats('x')).toBeUndefined()
  })

  it('requires quote text and trims the source', () => {
    expect(normalizeQuote({ text: '  hi  ', source: ' PWS ' })).toEqual({ text: 'hi', source: 'PWS' })
    expect(normalizeQuote({ text: '' })).toBeUndefined()
    expect(normalizeQuote(null)).toBeUndefined()
  })

  it('survives a normalizeChart round-trip', () => {
    const chart = normalizeChart(adorned())
    expect(chart.meta.winTheme).toBeTruthy()
    expect(chart.meta.stats).toHaveLength(2)
    expect(chart.meta.quote?.source).toBe('CPARS, FY24')
  })
})

describe('persuasion layout', () => {
  it('is absent (and shift is zero) when nothing is set', () => {
    const l = layoutChart(baseChart())
    expect(l.winTheme).toBeNull()
    expect(l.contentShift).toBe(0)
    expect(l.stats).toBeNull()
    expect(l.quote).toBeNull()
  })

  it('places the win-theme strip at the top and shifts content below it', () => {
    const l = layoutChart(adorned())
    expect(l.winTheme).not.toBeNull()
    expect(l.winTheme!.y).toBeLessThan(50)
    expect(l.contentShift).toBe(l.winTheme!.h + 16)
    // Height grows by exactly the shift relative to the unshifted stack.
    const plain = adorned()
    delete plain.meta.winTheme
    expect(l.height).toBeCloseTo(layoutChart(plain).height + l.contentShift, 5)
  })

  it('stacks stats, then quote, then caption beneath the content', () => {
    const l = layoutChart(adorned())
    const contentBottom = Math.max(...l.placed.map((p) => p.y + p.totalH))
    expect(l.stats!.y).toBeGreaterThan(contentBottom)
    expect(l.quote!.y).toBeGreaterThan(l.stats!.y + l.stats!.h)
    expect(l.caption!.y).toBeGreaterThan(l.quote!.y + l.quote!.h)
    expect(l.height).toBeGreaterThan(l.contentShift + l.caption!.y + l.caption!.h)
  })

  it('lays stat tiles left to right and carries icons', () => {
    const l = layoutChart(adorned())
    const [a, b] = l.stats!.tiles
    expect(b.x).toBeGreaterThan(a.x)
    expect(b.x).toBeCloseTo(a.x + a.w, 5)
    expect(a.icon).toBe('people')
    expect(b.icon).toBeUndefined()
  })

  it('adorns data layouts identically (table)', () => {
    const c = adorned()
    c.meta.layout = 'table'
    c.table = { columns: [{ label: 'A' }], rows: [{ cells: [{ text: 'x' }] }] }
    const l = layoutChart(c)
    expect(l.table).not.toBeNull()
    expect(l.winTheme).not.toBeNull()
    expect(l.stats!.tiles).toHaveLength(2)
    expect(l.quote!.lines.length).toBeGreaterThan(0)
  })

  it('widens the canvas when the stat strip outgrows the content', () => {
    const c = baseChart()
    c.meta.stats = [
      { value: '1,000,000+', label: 'a very long stat label indeed' },
      { value: '2,000,000+', label: 'another very long stat label' },
      { value: '3,000,000+', label: 'yet another very long stat label' },
    ]
    const l = layoutChart(c)
    expect(l.width).toBeGreaterThanOrEqual(l.stats!.x + l.stats!.w)
  })

  it('showcase templates carry persuasion content', () => {
    const kp = templates.find((t) => t.key === 'key-personnel')!.build()
    expect(kp.meta.winTheme).toBeTruthy()
    expect(kp.meta.stats!.length).toBeGreaterThanOrEqual(3)
    const cf = templates.find((t) => t.key === 'current-future')!.build()
    expect(cf.meta.quote?.source).toContain('PWS')
    const l = layoutChart(kp)
    expect(l.winTheme).not.toBeNull()
    expect(l.stats).not.toBeNull()
  })
})
