import { describe, expect, it } from 'vitest'
import {
  entryFromChart,
  isLibraryPack,
  LIBRARY_KIND,
  makePack,
  mergeLibrary,
  normalizeLibrary,
} from './library'
import { templates } from './templates'
import type { OrgChart } from './model'

const chart = (title = 'Sample'): OrgChart => ({
  version: 1,
  meta: { title, showTitle: true },
  roots: [{ id: 'a', title: 'A', variant: 'primary' }],
  groups: [],
  comms: [],
  legend: [],
})

describe('isLibraryPack', () => {
  it('recognizes a pack and rejects other shapes', () => {
    expect(isLibraryPack(makePack([]))).toBe(true)
    expect(isLibraryPack({ kind: 'nope', entries: [] })).toBe(false)
    expect(isLibraryPack(null)).toBe(false)
  })
})

describe('normalizeLibrary', () => {
  it('accepts a pack or a raw entry array and normalizes charts', () => {
    const pack = makePack([entryFromChart(chart('One'), 'One')])
    expect(normalizeLibrary(pack)).toHaveLength(1)
    expect(normalizeLibrary(pack.entries)).toHaveLength(1)
  })

  it('drops entries whose chart is invalid, keeps valid ones', () => {
    const entries = normalizeLibrary({
      kind: LIBRARY_KIND,
      version: 1,
      entries: [
        { id: 'x', name: 'Bad', chart: { roots: [] } }, // invalid: empty roots
        { id: 'y', name: 'Good', chart: chart('Good') },
      ],
    })
    expect(entries.map((e) => e.name)).toEqual(['Good'])
  })

  it('brand-locks entry charts through normalizeChart', () => {
    const off = chart()
    off.roots[0].color = '#ff00ff' // off-brand
    const [entry] = normalizeLibrary([{ id: 'z', name: 'Z', chart: off }])
    expect(entry.chart.roots[0].color).toBeUndefined()
  })

  it('fills a name from the chart title when missing', () => {
    const [entry] = normalizeLibrary([{ chart: chart('From Title') }])
    expect(entry.name).toBe('From Title')
    expect(entry.id).toBeTruthy()
  })
})

describe('mergeLibrary', () => {
  it('adds new entries and overwrites by id', () => {
    const a = entryFromChart(chart('A'), 'A')
    const b = entryFromChart(chart('B'), 'B')
    const bUpdated = { ...b, name: 'B v2' }
    const merged = mergeLibrary([a, b], [bUpdated, entryFromChart(chart('C'), 'C')])
    expect(merged).toHaveLength(3)
    expect(merged.find((e) => e.id === b.id)?.name).toBe('B v2')
  })
})

describe('entryFromChart', () => {
  it('deep-copies the chart and carries options', () => {
    const src = chart('Src')
    const entry = entryFromChart(src, 'Named', { description: 'desc', approved: true, updatedAt: '2026-01-01' })
    expect(entry.name).toBe('Named')
    expect(entry.approved).toBe(true)
    expect(entry.description).toBe('desc')
    entry.chart.meta.title = 'mutated'
    expect(src.meta.title).toBe('Src') // deep copy
  })
})

describe('round-trip a built-in template', () => {
  it('captures, packs, and reloads a template unchanged in structure', () => {
    const built = templates.find((t) => t.key === 'director-level')!.build()
    const pack = makePack([entryFromChart(built, 'Director Level')])
    const [entry] = normalizeLibrary(pack)
    expect(entry.chart.roots.length).toBe(built.roots.length)
    expect(entry.chart.compliance?.requirements.length).toBe(built.compliance?.requirements.length)
  })
})
