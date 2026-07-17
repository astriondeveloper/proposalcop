import { describe, expect, it } from 'vitest'
import { layoutChart, previewDrag } from './layout'
import { normalizeChart } from './model'
import { templates } from './templates'
import type { OrgChart, OrgNode } from './model'

const freeChart = (): OrgChart => ({
  version: 1,
  meta: { title: 'Arch', showTitle: true, layout: 'free' },
  roots: [
    {
      id: 'h',
      title: '',
      variant: 'hidden',
      children: [
        { id: 'a', title: 'API Gateway', variant: 'primary', pos: { x: 300, y: 200 } },
        { id: 'b', title: 'Data Lake', variant: 'secondary', shape: 'cylinder', pos: { x: 600, y: 400 } },
        { id: 'c', title: 'New Box', variant: 'secondary' },
        { id: 'd', title: 'Another New Box', variant: 'secondary' },
      ],
    },
  ],
  groups: [],
  comms: [{ id: 'e1', fromId: 'a', toId: 'b', arrow: 'end', label: 'query' }],
  legend: [],
})

describe('node shapes', () => {
  it('keeps valid shapes and drops unknown ones on normalize', () => {
    const c = freeChart()
    ;(c.roots[0].children![2] as OrgNode & { shape?: string }).shape = 'blob'
    const chart = normalizeChart(c)
    const nodes = chart.roots[0].children!
    expect(nodes[1].shape).toBe('cylinder')
    expect(nodes[2].shape).toBeUndefined()
  })

  it('gives silhouette shapes extra header height', () => {
    const plain = layoutChart(freeChart()).placed.find((p) => p.node.id === 'a')!
    const cyl = layoutChart(freeChart()).placed.find((p) => p.node.id === 'b')!
    expect(cyl.headerH).toBeGreaterThan(plain.headerH)
  })
})

describe('layoutFree', () => {
  it('honors manual positions and draws no hierarchy connectors', () => {
    const l = layoutChart(freeChart())
    const a = l.placed.find((p) => p.node.id === 'a')!
    expect(a.x).toBe(300)
    expect(a.y).toBe(200)
    expect(l.connectors).toHaveLength(0)
    expect(l.comms).toHaveLength(1)
    expect(l.comms[0].link.label).toBe('query')
  })

  it('deals unpositioned boxes onto distinct grid slots below placed content', () => {
    const l = layoutChart(freeChart())
    const c = l.placed.find((p) => p.node.id === 'c')!
    const d = l.placed.find((p) => p.node.id === 'd')!
    expect(c.x).not.toBe(d.x)
    // Below the lowest manually placed box (Data Lake at y=400).
    const lake = l.placed.find((p) => p.node.id === 'b')!
    expect(c.y).toBeGreaterThan(lake.y + lake.totalH)
  })

  it('keeps edges and skips hierarchy lines during a drag preview', () => {
    const chart = freeChart()
    const base = layoutChart(chart)
    const preview = previewDrag(chart, base, 'a', 10, 10)
    expect(preview.connectors).toHaveLength(0)
    expect(preview.comms).toHaveLength(1)
    expect(preview.placed.find((p) => p.node.id === 'a')!.x).toBe(10)
  })

  it('falls back to tree layout when the mode is not free', () => {
    const c = freeChart()
    delete c.meta.layout
    const l = layoutChart(c)
    expect(l.placed.length).toBeGreaterThan(0)
  })
})

describe('architecture templates', () => {
  it.each(['sys-arch', 'network', 'data-flow'])('%s renders free-form with shapes and edges', (key) => {
    const chart = templates.find((t) => t.key === key)!.build()
    expect(chart.meta.layout).toBe('free')
    const l = layoutChart(chart)
    // Every visible box carries a manual position (no grid fallbacks).
    for (const p of l.placed) expect(p.node.pos).toBeDefined()
    expect(l.connectors).toHaveLength(0)
    expect(l.comms.length).toBeGreaterThanOrEqual(6)
    const shapes = new Set(l.placed.map((p) => p.node.shape).filter(Boolean))
    expect(shapes.size).toBeGreaterThanOrEqual(2)
  })

  it('data-flow uses pill, diamond and cylinder shapes', () => {
    const l = layoutChart(templates.find((t) => t.key === 'data-flow')!.build())
    const shapes = l.placed.map((p) => p.node.shape)
    expect(shapes).toContain('pill')
    expect(shapes).toContain('diamond')
    expect(shapes).toContain('cylinder')
  })
})
