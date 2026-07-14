import { describe, expect, it } from 'vitest'
import { layoutChart, withWbsNumbers } from './layout'
import { templates } from './templates'
import type { OrgChart, OrgNode } from './model'

const n = (id: string, title: string, children?: OrgNode[]): OrgNode => ({
  id,
  title,
  variant: 'primary',
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

const titleMap = (roots: OrgNode[]): Record<string, string> => {
  const m: Record<string, string> = {}
  const walk = (list: OrgNode[]) => list.forEach((x) => { m[x.id] = x.title; walk(x.children ?? []) })
  walk(roots)
  return m
}

describe('withWbsNumbers', () => {
  it('numbers roots and descendants as an outline', () => {
    const out = withWbsNumbers(
      chartOf([n('r', 'Program', [n('a', 'SE', [n('a1', 'Reqs')]), n('b', 'SW')])]),
    )
    const t = titleMap(out.roots)
    expect(t.r).toBe('1  Program')
    expect(t.a).toBe('1.1  SE')
    expect(t.a1).toBe('1.1.1  Reqs')
    expect(t.b).toBe('1.2  SW')
  })

  it('numbers multiple roots sequentially', () => {
    const out = withWbsNumbers(chartOf([n('r1', 'One'), n('r2', 'Two')]))
    const t = titleMap(out.roots)
    expect(t.r1).toBe('1  One')
    expect(t.r2).toBe('2  Two')
  })

  it('treats hidden containers as transparent', () => {
    const hidden: OrgNode = { id: 'h', title: '', variant: 'hidden', children: [n('x', 'X'), n('y', 'Y')] }
    const out = withWbsNumbers(chartOf([hidden]))
    const t = titleMap(out.roots)
    expect(t.x).toBe('1  X')
    expect(t.y).toBe('2  Y')
  })

  it('does not mutate the input chart', () => {
    const chart = chartOf([n('r', 'Program')])
    withWbsNumbers(chart)
    expect(chart.roots[0].title).toBe('Program')
  })
})

describe('layoutChart WBS numbering', () => {
  it('prefixes placed titles only when the flag is on', () => {
    const base = templates.find((t) => t.key === 'wbs')!.build()
    expect(base.meta.showWbsNumbers).toBe(true)
    const on = layoutChart(base)
    expect(on.placed.some((p) => /^1(\.\d+)*\s\s/.test(p.node.title))).toBe(true)

    const off = layoutChart({ ...base, meta: { ...base.meta, showWbsNumbers: false } })
    expect(off.placed.every((p) => !/^\d+(\.\d+)*\s\s/.test(p.node.title))).toBe(true)
  })
})
