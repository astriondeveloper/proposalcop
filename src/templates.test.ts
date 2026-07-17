import { describe, expect, it } from 'vitest'
import { allNodes } from './model'
import { templates } from './templates'

describe('templates', () => {
  it.each(templates.map((t) => [t.key, t] as const))('%s builds a valid chart', (_key, t) => {
    const chart = t.build()
    const nodes = allNodes(chart).map(({ node }) => node)
    const ids = nodes.map((n) => n.id)

    // Non-empty and every id is unique.
    expect(chart.roots.length).toBeGreaterThan(0)
    expect(nodes.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)

    // Every comm and group references a node that actually exists.
    const idSet = new Set(ids)
    for (const c of chart.comms) {
      expect(idSet.has(c.fromId)).toBe(true)
      expect(idSet.has(c.toId)).toBe(true)
    }
    for (const g of chart.groups) {
      for (const m of g.memberIds) expect(idSet.has(m)).toBe(true)
    }

    // Legend entries are well-formed.
    for (const l of chart.legend) {
      expect(l.marker).toBeTruthy()
      expect(typeof l.label).toBe('string')
    }
  })

  it('exposes the default template key', async () => {
    const { DEFAULT_TEMPLATE_KEY } = await import('./templates')
    expect(templates.some((t) => t.key === DEFAULT_TEMPLATE_KEY)).toBe(true)
  })

  it('uses unique keys', () => {
    const keys = templates.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('management template pack', () => {
  const build = (key: string) => templates.find((t) => t.key === key)!.build()

  it('IMS spans the full period of performance in months', () => {
    const c = build('ims')
    expect(c.meta.layout).toBe('timeline')
    expect(c.schedule).toMatchObject({ unit: 'month', span: 60 })
    expect(c.schedule?.phases?.map((p) => p.label)).toEqual(['Base Yr', 'OY1', 'OY2', 'OY3', 'OY4'])
  })

  it('contract heritage covers a decade and ends at this RFP', () => {
    const c = build('heritage')
    expect(c.meta.layout).toBe('timeline')
    expect(c.schedule?.span).toBe(120)
    expect(c.schedule?.phases?.at(-1)?.label).toBe('This RFP')
  })

  it('battle rhythm is a table with internal and customer sections', () => {
    const c = build('battle-rhythm')
    expect(c.meta.layout).toBe('table')
    expect(c.table?.rows.filter((r) => r.header)).toHaveLength(2)
  })

  it('governance carries cadence and decision rights on every board', () => {
    const c = build('governance')
    const boards = allNodes(c)
      .map(({ node }) => node)
      .filter((n) => (n.details ?? []).length)
    expect(boards.length).toBeGreaterThanOrEqual(5)
    for (const b of boards) {
      expect(b.details!.map((d) => d.label)).toEqual(['Cadence:', 'Decides:'])
    }
  })

  it('escalation path flows left-to-right with customer notification edges', () => {
    const c = build('escalation')
    expect(c.meta.direction).toBe('LR')
    expect(c.comms.length).toBeGreaterThanOrEqual(2)
  })

  it('process flow assigns every step to a swimlane', () => {
    const c = build('process-flow')
    expect(c.meta.layout).toBe('swimlane')
    const grouped = new Set(c.groups.flatMap((g) => g.memberIds))
    for (const r of c.roots) expect(grouped.has(r.id)).toBe(true)
  })

  it('current vs. future pairs zoned columns with a transition edge', () => {
    const c = build('current-future')
    expect(c.roots).toHaveLength(2)
    expect(c.groups.map((g) => g.style).sort()).toEqual(['green', 'orange'])
    expect(c.comms[0].label).toBe('Astrion transition')
  })

  it('key personnel cards carry photo, badge and discriminator rows', () => {
    const c = build('key-personnel')
    const cards = allNodes(c)
      .map(({ node }) => node)
      .filter((n) => n.variant !== 'hidden')
    expect(cards).toHaveLength(4)
    for (const card of cards) {
      expect(card.photo).toBe(true)
      expect(card.badges).toContain('keyGold')
      expect(card.details!.some((d) => d.label === 'Discriminator:')).toBe(true)
    }
  })
})
