import { describe, expect, it } from 'vitest'
import { autoLegend } from './model'
import type { OrgChart } from './model'

const sample = (): OrgChart => ({
  version: 1,
  meta: { title: 'T', showTitle: true },
  roots: [
    {
      id: 'a',
      title: 'A',
      variant: 'primary',
      badges: ['keyGold'],
      children: [{ id: 'b', title: 'B', variant: 'accent' }],
    },
  ],
  groups: [{ id: 'g', label: 'Mission Focus', style: 'green', memberIds: ['b'] }],
  comms: [{ id: 'c', fromId: 'a', toId: 'b', arrow: 'both', style: 'solid' }],
  legend: [],
})

describe('autoLegend', () => {
  it('detects variants, badges, zones, and comms in use', () => {
    const items = autoLegend(sample())
    const markers = items.map((i) => i.marker)
    expect(markers).toContain('boxPrimary')
    expect(markers).toContain('boxAccent')
    expect(markers).toContain('keyGold')
    expect(markers).toContain('green')
    expect(markers).toContain('comm')
    expect(markers).not.toContain('boxSecondary') // not present in the chart
  })

  it('reuses the group label for zone entries', () => {
    expect(autoLegend(sample()).find((i) => i.marker === 'green')?.label).toBe('Mission Focus')
  })

  it('ignores hidden containers', () => {
    const c: OrgChart = {
      version: 1,
      meta: { title: 'T', showTitle: true },
      roots: [{ id: 'h', title: '', variant: 'hidden', children: [{ id: 'x', title: 'X', variant: 'secondary' }] }],
      groups: [],
      comms: [],
      legend: [],
    }
    expect(autoLegend(c).map((i) => i.marker)).toEqual(['boxSecondary'])
  })
})
