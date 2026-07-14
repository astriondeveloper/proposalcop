import { describe, expect, it } from 'vitest'
import { buildPdf } from './pdf'

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('buildPdf', () => {
  const pdf = buildPdf(new Uint8Array([1, 2, 3, 4, 5]), 200, 100, 400, 200)
  const s = text(pdf)

  it('starts with a PDF header and ends with EOF', () => {
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('declares the page size and a full-page image draw', () => {
    expect(s).toContain('/MediaBox[0 0 400 200]')
    expect(s).toContain('/Width 200/Height 100/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/FlateDecode/Length 5')
    expect(s).toContain('400 0 0 200 0 0 cm /Im0 Do Q')
  })

  it('has a well-formed xref whose startxref points at the xref table', () => {
    const m = s.match(/startxref\n(\d+)\n%%EOF/)
    expect(m).not.toBeNull()
    const startxref = Number(m![1])
    expect(s.slice(startxref, startxref + 4)).toBe('xref')
    expect(s).toContain('xref\n0 6\n')
    expect(s).toContain('/Size 6/Root 1 0 R')
  })
})
