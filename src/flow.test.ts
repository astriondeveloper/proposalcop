import { describe, expect, it } from 'vitest'
import { layoutChart } from './layout'
import { normalizeChart, normalizeFlow, parseSelection, stepSelId } from './model'
import { templates } from './templates'
import type { OrgChart } from './model'

const flowChart = (layout: 'cycle' | 'pipeline' | 'stack'): OrgChart => ({
  version: 1,
  meta: { title: 'F', showTitle: true, layout },
  roots: [{ id: 'h', title: '', variant: 'hidden' }],
  groups: [],
  comms: [],
  legend: [],
  flow: {
    hub: 'Loop',
    steps: [
      { id: 'a', title: 'Plan', detail: 'Baseline the gap' },
      { id: 'b', title: 'Do' },
      { id: 'c', title: 'Check', variant: 'accent' },
      { id: 'd', title: 'Act' },
    ],
  },
})

describe('normalizeFlow', () => {
  it('coerces steps, validates variants, fills ids and keeps the hub', () => {
    const f = normalizeFlow({
      hub: ' Center ',
      steps: [{ title: 'A', detail: ' x ', variant: 'neon' }, null, { title: 'B', variant: 'accent' }],
    })!
    expect(f.steps).toHaveLength(2)
    expect(f.steps[0].detail).toBe('x')
    expect(f.steps[0].variant).toBeUndefined()
    expect(f.steps[1].variant).toBe('accent')
    expect(f.steps[0].id).toBeTruthy()
    expect(f.hub).toBe('Center')
    expect(normalizeFlow({})).toBeUndefined()
    expect(normalizeFlow(null)).toBeUndefined()
  })

  it('survives a normalizeChart round-trip for every flow mode', () => {
    for (const mode of ['cycle', 'pipeline', 'stack'] as const) {
      const chart = normalizeChart(flowChart(mode))
      expect(chart.meta.layout).toBe(mode)
      expect(chart.flow?.steps).toHaveLength(4)
    }
  })
})

describe('flow layouts', () => {
  it('produces flow geometry only for the flow layouts', () => {
    expect(layoutChart(flowChart('cycle')).flow?.kind).toBe('cycle')
    expect(layoutChart(flowChart('pipeline')).flow?.kind).toBe('pipeline')
    expect(layoutChart(flowChart('stack')).flow?.kind).toBe('stack')
    const tree: OrgChart = { ...flowChart('cycle'), meta: { title: 'F', showTitle: true } }
    expect(layoutChart(tree).flow).toBeNull()
  })

  it('cycle: one closed segment per step plus the hub label', () => {
    const fl = layoutChart(flowChart('cycle')).flow!
    expect(fl.steps).toHaveLength(4)
    for (const s of fl.steps) {
      expect(s.path).toContain('A ') // annular arcs
      expect(s.path.trim().endsWith('Z')).toBe(true)
      expect(s.titleLines.length).toBeGreaterThan(0)
    }
    expect(fl.hub!.lines).toEqual(['Loop'])
    // Detail sits outside the ring; the hub sits at the center.
    const withDetail = fl.steps.find((s) => s.detail)!
    const d = Math.hypot(withDetail.detail!.x - fl.hub!.x, withDetail.detail!.y - fl.hub!.y)
    expect(d).toBeGreaterThan(150)
  })

  it('cycle: segments have distinct label positions around the center', () => {
    const fl = layoutChart(flowChart('cycle')).flow!
    const keys = new Set(fl.steps.map((s) => `${Math.round(s.labelX)}:${Math.round(s.labelY)}`))
    expect(keys.size).toBe(4)
  })

  it('pipeline: chevrons run left to right with details underneath', () => {
    const fl = layoutChart(flowChart('pipeline')).flow!
    for (let i = 1; i < fl.steps.length; i++) {
      expect(fl.steps[i].labelX).toBeGreaterThan(fl.steps[i - 1].labelX)
    }
    const withDetail = fl.steps.find((s) => s.detail)!
    expect(withDetail.detail!.y).toBeGreaterThan(withDetail.labelY)
  })

  it('stack: layers stack top to bottom in step order', () => {
    const fl = layoutChart(flowChart('stack')).flow!
    for (let i = 1; i < fl.steps.length; i++) {
      expect(fl.steps[i].labelY).toBeGreaterThan(fl.steps[i - 1].labelY)
    }
    expect(fl.hub).toBeNull()
  })

  it('rotates brand variants when a step has none, honoring overrides', () => {
    const fl = layoutChart(flowChart('stack')).flow!
    expect(fl.steps[0].fill).not.toBe(fl.steps[1].fill)
    const check = fl.steps[2] // explicit accent
    expect(check.fill).toBe('#FFAF2E')
  })

  it('step selection ids round-trip', () => {
    expect(parseSelection(stepSelId('f_1'))).toEqual({ kind: 'step', id: 'f_1' })
  })

  it('renders the pdca / devsecops / tech-stack templates', () => {
    const pdca = layoutChart(templates.find((t) => t.key === 'pdca')!.build()).flow!
    expect(pdca.kind).toBe('cycle')
    expect(pdca.steps).toHaveLength(4)
    expect(pdca.hub).not.toBeNull()
    const dso = layoutChart(templates.find((t) => t.key === 'devsecops')!.build()).flow!
    expect(dso.kind).toBe('pipeline')
    expect(dso.steps).toHaveLength(7)
    expect(dso.steps.every((s) => s.detail)).toBe(true)
    const stack = layoutChart(templates.find((t) => t.key === 'tech-stack')!.build()).flow!
    expect(stack.kind).toBe('stack')
    expect(stack.steps).toHaveLength(5)
  })
})
