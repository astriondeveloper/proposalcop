import { describe, expect, it } from 'vitest'
import { cellSelId, colSelId, parseSelection, riskSelId, seriesSelId } from './model'

describe('data-element selection ids', () => {
  it('round-trips every selection kind', () => {
    expect(parseSelection(cellSelId(2, 3))).toEqual({ kind: 'cell', row: 2, col: 3 })
    expect(parseSelection(colSelId(0))).toEqual({ kind: 'col', col: 0 })
    expect(parseSelection(riskSelId('r_abc_1'))).toEqual({ kind: 'risk', id: 'r_abc_1' })
    expect(parseSelection(seriesSelId('s_abc_2'))).toEqual({ kind: 'series', id: 's_abc_2' })
  })

  it('returns null for node ids, empty and malformed selections', () => {
    expect(parseSelection('n_kx2f_1')).toBeNull() // a box id, not a data element
    expect(parseSelection(null)).toBeNull()
    expect(parseSelection(undefined)).toBeNull()
    expect(parseSelection('')).toBeNull()
    expect(parseSelection('cell:1')).toBeNull()
    expect(parseSelection('cell:a:b')).toBeNull()
    expect(parseSelection('cell:-1:2')).toBeNull()
    expect(parseSelection('col:x')).toBeNull()
    expect(parseSelection('risk:')).toBeNull()
  })

  it('keeps ids containing separators intact', () => {
    expect(parseSelection('risk:a:b')).toEqual({ kind: 'risk', id: 'a:b' })
  })
})
