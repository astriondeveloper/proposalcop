import { describe, expect, it } from 'vitest'
import {
  buildComplianceCsv,
  computeCompliance,
  normalizeRef,
  parseRequirements,
  refsFromDetails,
} from './compliance'
import { normalizeChart } from './model'
import type { OrgChart, OrgNode } from './model'

function chartOf(roots: OrgNode[], compliance?: OrgChart['compliance']): OrgChart {
  return {
    version: 1,
    meta: { title: 'Test', showTitle: true },
    roots,
    groups: [],
    comms: [],
    legend: [],
    ...(compliance ? { compliance } : {}),
  }
}

const node = (id: string, partial: Partial<OrgNode> = {}): OrgNode => ({
  id,
  title: id.toUpperCase(),
  variant: 'primary',
  ...partial,
})

describe('normalizeRef', () => {
  it('trims, collapses inner whitespace, and lowercases', () => {
    expect(normalizeRef('  3.2 . 1 ')).toBe('3.2 . 1')
    expect(normalizeRef('PWS-A')).toBe('pws-a')
  })
})

describe('computeCompliance', () => {
  it('marks a requirement covered when a node references it', () => {
    const chart = chartOf(
      [node('pm', { refs: [{ kind: 'PWS', ref: '3.2.1' }] })],
      { requirements: [{ id: 'r1', kind: 'PWS', ref: '3.2.1', title: 'Manage schedule' }] },
    )
    const report = computeCompliance(chart)
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].status).toBe('covered')
    expect(report.rows[0].owners).toEqual([{ id: 'pm', title: 'PM' }])
    expect(report.coverage).toEqual({ covered: 1, total: 1, pct: 100 })
  })

  it('flags a requirement with no owner as a gap', () => {
    const chart = chartOf(
      [node('pm')],
      { requirements: [{ id: 'r1', kind: 'PWS', ref: '3.2.1' }] },
    )
    const report = computeCompliance(chart)
    expect(report.rows[0].status).toBe('gap')
    expect(report.coverage.pct).toBe(0)
  })

  it('matches references case- and whitespace-insensitively', () => {
    const chart = chartOf(
      [node('a', { refs: [{ kind: 'SectionL', ref: ' L.4 ' }] })],
      { requirements: [{ id: 'r1', kind: 'SectionL', ref: 'l.4' }] },
    )
    expect(computeCompliance(chart).rows[0].status).toBe('covered')
  })

  it('does not cross kinds that share a ref number', () => {
    const chart = chartOf(
      [node('a', { refs: [{ kind: 'SOW', ref: '3.2.1' }] })],
      { requirements: [{ id: 'r1', kind: 'PWS', ref: '3.2.1' }] },
    )
    const report = computeCompliance(chart)
    expect(report.rows[0].status).toBe('gap')
    expect(report.orphans).toHaveLength(1)
    expect(report.orphans[0]).toMatchObject({ nodeId: 'a', kind: 'SOW', ref: '3.2.1' })
  })

  it('collects references not present in the register as orphans', () => {
    const chart = chartOf(
      [node('a', { refs: [{ kind: 'PWS', ref: '9.9.9' }] })],
      { requirements: [{ id: 'r1', kind: 'PWS', ref: '3.2.1' }] },
    )
    const report = computeCompliance(chart)
    expect(report.orphans).toHaveLength(1)
    expect(report.orphans[0].ref).toBe('9.9.9')
  })

  it('counts a box that lists a requirement twice as one owner', () => {
    const chart = chartOf(
      [node('a', { refs: [{ kind: 'PWS', ref: '1.0' }, { kind: 'PWS', ref: '1.0' }] })],
      { requirements: [{ id: 'r1', kind: 'PWS', ref: '1.0' }] },
    )
    expect(computeCompliance(chart).rows[0].owners).toHaveLength(1)
  })

  it('lists multiple owners for a shared requirement', () => {
    const chart = chartOf(
      [
        node('a', { refs: [{ kind: 'PWS', ref: '1.0' }] }),
        node('b', { refs: [{ kind: 'PWS', ref: '1.0' }] }),
      ],
      { requirements: [{ id: 'r1', kind: 'PWS', ref: '1.0' }] },
    )
    expect(computeCompliance(chart).rows[0].owners.map((o) => o.id)).toEqual(['a', 'b'])
  })

  it('rolls coverage up per kind', () => {
    const chart = chartOf(
      [node('a', { refs: [{ kind: 'PWS', ref: '1' }, { kind: 'SOW', ref: '2' }] })],
      {
        requirements: [
          { id: 'r1', kind: 'PWS', ref: '1' },
          { id: 'r2', kind: 'PWS', ref: '9' },
          { id: 'r3', kind: 'SOW', ref: '2' },
        ],
      },
    )
    const report = computeCompliance(chart)
    expect(report.byKind).toEqual([
      { kind: 'PWS', covered: 1, total: 2 },
      { kind: 'SOW', covered: 1, total: 1 },
    ])
    expect(report.coverage).toEqual({ covered: 2, total: 3, pct: 67 })
  })

  it('ignores blank references while typing', () => {
    const chart = chartOf(
      [node('a', { refs: [{ kind: 'PWS', ref: '   ' }] })],
      { requirements: [{ id: 'r1', kind: 'PWS', ref: '1' }] },
    )
    const report = computeCompliance(chart)
    expect(report.orphans).toHaveLength(0)
    expect(report.rows[0].status).toBe('gap')
  })

  it('handles a chart with no register', () => {
    const report = computeCompliance(chartOf([node('a')]))
    expect(report.rows).toHaveLength(0)
    expect(report.coverage).toEqual({ covered: 0, total: 0, pct: 0 })
  })

  it('finds references on deeply nested nodes', () => {
    const chart = chartOf(
      [node('root', { children: [node('child', { refs: [{ kind: 'PWS', ref: '1' }] })] })],
      { requirements: [{ id: 'r1', kind: 'PWS', ref: '1' }] },
    )
    expect(computeCompliance(chart).rows[0].owners[0].id).toBe('child')
  })
})

describe('refsFromDetails', () => {
  it('extracts refs from PWS/SOW detail rows and splits on separators', () => {
    const n = node('a', {
      details: [
        { label: 'PWS:', text: '3.1, 3.2; 3.3' },
        { label: 'Interface:', text: 'CO, COR' },
      ],
    })
    expect(refsFromDetails(n)).toEqual([
      { kind: 'PWS', ref: '3.1' },
      { kind: 'PWS', ref: '3.2' },
      { kind: 'PWS', ref: '3.3' },
    ])
  })

  it('keeps ranges intact and de-dupes within a node', () => {
    const n = node('a', { details: [{ label: 'SOW', text: '3.1 – 3.3, 3.1 – 3.3' }] })
    expect(refsFromDetails(n)).toEqual([{ kind: 'SOW', ref: '3.1 – 3.3' }])
  })

  it('ignores detail rows that name no document', () => {
    expect(refsFromDetails(node('a', { details: [{ label: 'Deliverables:', text: 'X' }] }))).toEqual([])
  })
})

describe('parseRequirements', () => {
  it('splits a leading ref token from the title', () => {
    expect(parseRequirements('3.2.1 Manage the program schedule', 'PWS')).toEqual([
      { kind: 'PWS', ref: '3.2.1', title: 'Manage the program schedule' },
    ])
  })

  it('handles separators and bare refs across lines', () => {
    const out = parseRequirements('1.0: Overview\n2.0 - Scope\n3.0\n\n', 'SOW')
    expect(out).toEqual([
      { kind: 'SOW', ref: '1.0', title: 'Overview' },
      { kind: 'SOW', ref: '2.0', title: 'Scope' },
      { kind: 'SOW', ref: '3.0' },
    ])
  })
})

describe('buildComplianceCsv', () => {
  it('emits a header and one row per requirement with joined owners', () => {
    const chart = chartOf(
      [
        node('pm', { title: 'Program Manager', refs: [{ kind: 'PWS', ref: '1.0' }] }),
        node('qa', { title: 'Quality', refs: [{ kind: 'PWS', ref: '1.0' }] }),
      ],
      { requirements: [{ id: 'r1', kind: 'PWS', ref: '1.0', title: 'Lead' }] },
    )
    const csv = buildComplianceCsv(computeCompliance(chart))
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Kind,Reference,Requirement,Status,Owners')
    expect(lines[1]).toBe('"PWS","1.0","Lead","Covered","Program Manager; Quality"')
  })
})

describe('normalizeChart — compliance + refs', () => {
  it('preserves a valid register and node refs through a round-trip', () => {
    const chart = normalizeChart({
      roots: [{ id: 'a', title: 'A', variant: 'primary', refs: [{ kind: 'PWS', ref: '3.1' }] }],
      compliance: { requirements: [{ id: 'r1', kind: 'PWS', ref: '3.1', title: 'Do' }] },
    })
    expect(chart.compliance?.requirements).toHaveLength(1)
    expect(chart.roots[0].refs).toEqual([{ kind: 'PWS', ref: '3.1' }])
  })

  it('drops malformed refs and requirements', () => {
    const chart = normalizeChart({
      roots: [
        {
          id: 'a',
          title: 'A',
          variant: 'primary',
          refs: [{ kind: 'BOGUS', ref: '1' }, { kind: 'PWS', ref: '  ' }, { kind: 'PWS', ref: ' 2.0 ' }],
        },
      ],
      compliance: {
        requirements: [
          { kind: 'PWS', ref: '2.0' }, // missing id → gets one
          { kind: 'NOPE', ref: '1' }, // bad kind → dropped
          { kind: 'PWS', ref: '' }, // empty ref → dropped
          { id: 'dup1', kind: 'PWS', ref: '2.0' }, // duplicate (kind, ref) → dropped
        ],
      },
    })
    expect(chart.roots[0].refs).toEqual([{ kind: 'PWS', ref: '2.0' }])
    expect(chart.compliance?.requirements).toHaveLength(1)
    expect(chart.compliance?.requirements[0]).toMatchObject({ kind: 'PWS', ref: '2.0' })
    expect(chart.compliance?.requirements[0].id).toBeTruthy()
  })

  it('leaves compliance undefined when nothing valid remains', () => {
    const chart = normalizeChart({
      roots: [{ id: 'a', title: 'A', variant: 'primary' }],
      compliance: { requirements: [{ kind: 'NOPE', ref: '1' }] },
    })
    expect(chart.compliance).toBeUndefined()
  })
})
