import { describe, expect, it } from 'vitest'
import { layoutChart } from './layout'
import { templates } from './templates'
import type { OrgChart } from './model'

const timelineChart = (): OrgChart => ({
  version: 1,
  meta: { title: 'S', showTitle: true, layout: 'timeline' },
  schedule: { unit: 'day', span: 100 },
  roots: [
    { id: 'a', title: 'Task A', variant: 'primary', start: 0, duration: 50 },
    { id: 'b', title: 'Task B', variant: 'secondary', start: 50, duration: 50 },
    { id: 'm', title: 'Done', variant: 'accent', start: 100, milestone: true },
  ],
  groups: [],
  comms: [],
  legend: [],
})

describe('layoutTimeline', () => {
  it('produces timeline geometry only for the timeline layout', () => {
    expect(layoutChart(timelineChart()).timeline).not.toBeNull()
    const tree = { ...timelineChart(), meta: { title: 'S', showTitle: true } }
    expect(layoutChart(tree).timeline).toBeNull()
  })

  it('scales bars to the span and places them by start/duration', () => {
    const tl = layoutChart(timelineChart()).timeline!
    expect(tl.span).toBe(100)
    expect(tl.unit).toBe('day')
    expect(tl.bars).toHaveLength(3)
    const perUnit = tl.plotW / 100
    expect(tl.bars[0].barX).toBeCloseTo(tl.plotX)
    expect(tl.bars[0].barW).toBeCloseTo(50 * perUnit)
    expect(tl.bars[1].barX).toBeCloseTo(tl.plotX + 50 * perUnit)
  })

  it('renders milestones as zero-width markers at their start', () => {
    const tl = layoutChart(timelineChart()).timeline!
    const m = tl.bars[2]
    expect(m.milestone).toBe(true)
    expect(m.barW).toBe(0)
    expect(m.barX).toBeCloseTo(tl.plotX + 100 * (tl.plotW / 100))
  })

  it('defaults phase markers to 30/60/90 for day units', () => {
    const tl = layoutChart(timelineChart()).timeline!
    expect(tl.phases).toHaveLength(3)
    expect(tl.ticks[0].label).toBe('D0')
    expect(tl.ticks[tl.ticks.length - 1].label).toBe('D100')
  })

  it('auto-computes span from the latest task end when unset', () => {
    const c = timelineChart()
    delete c.schedule!.span
    const tl = layoutChart(c).timeline!
    expect(tl.span).toBe(100) // Task B ends at 100
  })

  it('rows follow DFS order including nested tasks', () => {
    const tl = layoutChart(templates.find((t) => t.key === 'transition')!.build()).timeline!
    expect(tl.bars).toHaveLength(11)
    expect(tl.bars.filter((b) => b.milestone)).toHaveLength(2)
    expect(tl.phases.map((p) => p.label)).toEqual(['30-Day', '60-Day', 'FOC (90)'])
    // Nested tasks are indented (depth 1).
    expect(tl.bars.some((b) => b.depth === 1)).toBe(true)
  })

  it('builds workstream swimlane bands from groups', () => {
    const tl = layoutChart(templates.find((t) => t.key === 'transition')!.build()).timeline!
    expect(tl.bands.map((b) => b.label)).toEqual(['Stand-up', 'Transition', 'Operations'])
    expect(tl.bands.every((b) => b.h > 0)).toBe(true)
  })
})
