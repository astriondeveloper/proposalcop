import { describe, expect, it } from 'vitest'
import { layoutChart } from './layout'
import { normalizeChart } from './model'
import type { OrgChart } from './model'

const base = (caption?: string): OrgChart => ({
  version: 1,
  meta: { title: 'T', showTitle: true, ...(caption ? { caption } : {}) },
  roots: [{ id: 'a', title: 'A', variant: 'primary' }],
  groups: [],
  comms: [],
  legend: [],
})

describe('action caption', () => {
  it('is null when unset', () => {
    expect(layoutChart(base()).caption).toBeNull()
  })

  it('wraps into lines and grows the canvas height', () => {
    const long =
      'A single accountable lead on every PWS task cuts handoffs and retires transition risk by day 30, keeping the customer mission on schedule throughout phase-in.'
    const l = layoutChart(base(long))
    expect(l.caption).not.toBeNull()
    expect(l.caption!.lines.length).toBeGreaterThan(1)
    expect(l.height).toBeGreaterThan(layoutChart(base()).height)
  })

  it('normalizeChart keeps a non-empty caption and drops whitespace-only', () => {
    const roots = [{ id: 'a', title: 'A', variant: 'primary' as const }]
    expect(normalizeChart({ roots, meta: { title: 'T', caption: 'Hello' } }).meta.caption).toBe('Hello')
    expect(normalizeChart({ roots, meta: { title: 'T', caption: '   ' } }).meta.caption).toBeUndefined()
  })

  it('renders on the timeline layout too', () => {
    const c = base('Phase-in completes by day 90.')
    c.meta.layout = 'timeline'
    expect(layoutChart(c).caption).not.toBeNull()
  })
})

describe('classification banner', () => {
  it('normalizeChart keeps a non-empty banner and drops whitespace-only', () => {
    const roots = [{ id: 'a', title: 'A', variant: 'primary' as const }]
    expect(normalizeChart({ roots, meta: { title: 'T', banner: 'CUI' } }).meta.banner).toBe('CUI')
    expect(normalizeChart({ roots, meta: { title: 'T', banner: '  ' } }).meta.banner).toBeUndefined()
  })

  it('layout carries the banner text', () => {
    expect(layoutChart(base()).banner).toBeNull()
    const c = base()
    c.meta.banner = 'UNCLASSIFIED//FOUO'
    expect(layoutChart(c).banner).toBe('UNCLASSIFIED//FOUO')
  })
})
