import { describe, expect, it } from 'vitest'
import { layoutChart, niceTicks } from './layout'
import { normalizeChart, normalizeXY, parsePoints } from './model'
import { templates } from './templates'
import type { OrgChart } from './model'

const xyChart = (): OrgChart => ({
  version: 1,
  meta: { title: 'XY', showTitle: true, layout: 'xy' },
  roots: [{ id: 'h', title: '', variant: 'hidden' }],
  groups: [],
  comms: [],
  legend: [],
  xy: {
    xLabel: 'Weeks',
    yLabel: 'FTEs',
    series: [
      {
        id: 'a',
        label: 'Ramp',
        kind: 'area',
        variant: 'secondary',
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 50 },
          { x: 10, y: 100 },
        ],
      },
      {
        id: 'b',
        label: 'Bars',
        kind: 'bar',
        points: [
          { x: 0, y: 20 },
          { x: 5, y: 40 },
          { x: 10, y: 60 },
        ],
      },
    ],
  },
})

describe('parsePoints', () => {
  it('parses comma / space / tab separated pairs, skipping bad lines', () => {
    expect(parsePoints('0, 10\n4 45\n8\t80\njunk\n5, x\n')).toEqual([
      { x: 0, y: 10 },
      { x: 4, y: 45 },
      { x: 8, y: 80 },
    ])
  })

  it('accepts negatives and decimals', () => {
    expect(parsePoints('-1.5, 2.25')).toEqual([{ x: -1.5, y: 2.25 }])
  })
})

describe('niceTicks', () => {
  it('produces round steps inside the range by default', () => {
    expect(niceTicks(0, 10)).toEqual([0, 2, 4, 6, 8, 10])
    expect(niceTicks(0, 97)).toEqual([0, 20, 40, 60, 80])
  })

  it('expands to step multiples when asked (axis domains)', () => {
    expect(niceTicks(0, 97, 5, true)).toEqual([0, 20, 40, 60, 80, 100])
    const t = niceTicks(-7, 23, 5, true)
    expect(t[0]).toBeLessThanOrEqual(-7)
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(23)
  })

  it('handles a degenerate range', () => {
    const t = niceTicks(5, 5)
    expect(t.length).toBeGreaterThan(1)
  })
})

describe('normalizeXY', () => {
  it('coerces series, drops junk points, validates kind and variant', () => {
    const xy = normalizeXY({
      series: [
        {
          label: 'S',
          kind: 'nope',
          variant: 'neon',
          points: [{ x: 1, y: 2 }, { x: 'a', y: 3 }, null, { x: 4, y: Infinity }],
        },
      ],
    })!
    expect(xy.series[0].kind).toBe('line')
    expect(xy.series[0].variant).toBeUndefined()
    expect(xy.series[0].points).toEqual([{ x: 1, y: 2 }])
    expect(xy.series[0].id).toBeTruthy()
    expect(normalizeXY({})).toBeUndefined()
  })

  it('survives a normalizeChart round-trip', () => {
    const chart = normalizeChart(xyChart())
    expect(chart.meta.layout).toBe('xy')
    expect(chart.xy?.series).toHaveLength(2)
    expect(chart.xy?.xLabel).toBe('Weeks')
  })
})

describe('layoutXY', () => {
  it('produces xy geometry only for the xy layout', () => {
    expect(layoutChart(xyChart()).xy).not.toBeNull()
    const tree: OrgChart = { ...xyChart(), meta: { title: 'XY', showTitle: true } }
    expect(layoutChart(tree).xy).toBeNull()
  })

  it('maps points linearly with y increasing upward', () => {
    const xc = layoutChart(xyChart()).xy!
    const ramp = xc.series.find((s) => s.id === 'a')!
    expect(ramp.dots).toHaveLength(3)
    // x = 0 sits right of the plot's left edge (bar half-slot padding).
    expect(ramp.dots[0].x).toBeGreaterThanOrEqual(xc.x)
    expect(ramp.dots[2].x).toBeLessThanOrEqual(xc.x + xc.plotW + 0.001)
    // Higher y values sit higher on screen (smaller screen y).
    expect(ramp.dots[2].y).toBeLessThan(ramp.dots[0].y)
    expect(ramp.linePath).toContain('M')
    expect(ramp.areaPath).toContain('Z')
  })

  it('grows bars from the zero baseline', () => {
    const xc = layoutChart(xyChart()).xy!
    const bars = xc.series.find((s) => s.id === 'b')!.bars!
    expect(bars).toHaveLength(3)
    for (const b of bars) {
      expect(b.h).toBeGreaterThan(0)
      expect(b.y + b.h).toBeCloseTo(xc.zeroY, 5)
    }
    // Taller value → taller bar.
    expect(bars[2].h).toBeGreaterThan(bars[0].h)
  })

  it('always includes zero in the y domain', () => {
    const c = xyChart()
    c.xy!.series = [
      { id: 'a', label: 'High', kind: 'line', points: [{ x: 0, y: 80 }, { x: 1, y: 90 }] },
    ]
    const xc = layoutChart(c).xy!
    // The zero baseline is the plot bottom when all data is positive.
    expect(xc.zeroY).toBeCloseTo(xc.y + xc.plotH, 5)
    expect(xc.yTicks.some((t) => t.label === '0')).toBe(true)
  })

  it('builds one legend entry per labeled series', () => {
    const xc = layoutChart(xyChart()).xy!
    expect(xc.legend.map((l) => l.label)).toEqual(['Ramp', 'Bars'])
    expect(xc.legend[1].x).toBeGreaterThan(xc.legend[0].x)
  })

  it('renders the staffing-ramp, risk-burndown and roi templates', () => {
    for (const key of ['staffing-ramp', 'risk-burndown', 'roi']) {
      const l = layoutChart(templates.find((t) => t.key === key)!.build())
      expect(l.xy, key).not.toBeNull()
      expect(l.xy!.series.length).toBeGreaterThanOrEqual(2)
    }
    const roi = layoutChart(templates.find((t) => t.key === 'roi')!.build()).xy!
    expect(roi.series.some((s) => s.bars?.length)).toBe(true)
    expect(roi.series.some((s) => s.linePath)).toBe(true)
  })
})
