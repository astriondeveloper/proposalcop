import { describe, expect, it } from 'vitest'
import { layoutChart, previewDrag } from './layout'
import type { LayoutMode, OrgChart, OrgNode, Variant } from './model'

let idc = 0
function makeTree(depth: number, branch: number): OrgNode {
  idc++
  const variant: Variant = depth === 0 ? 'primary' : depth === 1 ? 'secondary' : 'tertiary'
  const node: OrgNode = { id: `n${idc}`, title: `Node ${idc}`, variant, children: [] }
  if (depth > 0) for (let i = 0; i < branch; i++) node.children!.push(makeTree(depth - 1, branch))
  return node
}

function bigChart(depth: number, branch: number): OrgChart {
  idc = 0
  const root = makeTree(depth, branch)
  const ids: string[] = []
  const walk = (n: OrgNode) => {
    ids.push(n.id)
    ;(n.children ?? []).forEach(walk)
  }
  walk(root)
  const comms = Array.from({ length: 40 }, (_, i) => ({
    id: `c${i}`,
    fromId: ids[(i * 7) % ids.length],
    toId: ids[(i * 13 + 5) % ids.length],
    arrow: 'end' as const,
    style: 'solid' as const,
  }))
  const groups = ids.slice(1, 5).map((mid, i) => ({
    id: `g${i}`,
    label: `Group ${i}`,
    style: 'blue' as const,
    memberIds: [mid],
  }))
  return { version: 1, meta: { title: 'Big', showTitle: true }, roots: [root], groups, comms, legend: [] }
}

describe('large charts', () => {
  const chart = bigChart(4, 5) // 781 nodes
  const total = 781
  const modes: LayoutMode[] = ['tree', 'radial', 'layered', 'matrix', 'swimlane']

  it.each(modes)('lays out a 781-node chart in %s mode with finite geometry', (mode) => {
    const l = layoutChart({ ...chart, meta: { ...chart.meta, layout: mode } })
    expect(l.placed).toHaveLength(total)
    expect(l.placed.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
    expect(Number.isFinite(l.width) && l.width > 0).toBe(true)
    expect(Number.isFinite(l.height) && l.height > 0).toBe(true)
  })

  it('previewDrag reuses untouched box references and moves only the target', () => {
    const base = layoutChart(chart)
    const target = base.placed[300]
    const preview = previewDrag(chart, base, target.node.id, 4000, 3000)
    const movedIds = preview.placed.filter((p, i) => p !== base.placed[i]).map((p) => p.node.id)
    // Exactly the dragged box is a new object; every other box is shared by ref.
    expect(movedIds).toEqual([target.node.id])
    const moved = preview.placed.find((p) => p.node.id === target.node.id)!
    expect([moved.x, moved.y]).toEqual([4000, 3000])
  })
})
