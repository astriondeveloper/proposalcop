import { describe, expect, it } from 'vitest'
import { arcCenter, buildZip, crc32, custGeomXml, parsePaint, parsePath, pathBounds } from './pptx'

const bytes = (s: string) => new TextEncoder().encode(s)
const u32le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)

describe('crc32', () => {
  it('matches the standard check value for "123456789"', () => {
    expect(crc32(bytes('123456789')) >>> 0).toBe(0xcbf43926)
  })

  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('buildZip', () => {
  it('produces a store-method archive with a valid EOCD and local headers', () => {
    const entries = [
      { name: 'a.txt', data: bytes('hello') },
      { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3, 4]) },
    ]
    const zip = buildZip(entries)
    // Local file header signature at the start.
    expect([zip[0], zip[1], zip[2], zip[3]]).toEqual([0x50, 0x4b, 0x03, 0x04])
    // End-of-central-directory signature present, with the right entry count.
    const eocd = zip.length - 22
    expect([zip[eocd], zip[eocd + 1], zip[eocd + 2], zip[eocd + 3]]).toEqual([0x50, 0x4b, 0x05, 0x06])
    expect(zip[eocd + 10] | (zip[eocd + 11] << 8)).toBe(2)
    // First local header carries the stored CRC and both sizes = 5 ("hello").
    expect(u32le(zip, 14) >>> 0).toBe(crc32(bytes('hello')))
    expect(u32le(zip, 18)).toBe(5)
    expect(u32le(zip, 22)).toBe(5)
    // The filename and payload follow the 30-byte local header.
    expect(new TextDecoder().decode(zip.slice(30, 35))).toBe('a.txt')
    expect(new TextDecoder().decode(zip.slice(35, 40))).toBe('hello')
  })
})

describe('parsePath', () => {
  it('parses absolute commands, folding H/V into L', () => {
    expect(parsePath('M 10 20 H 30 V 40 L 5 5 Z')).toEqual([
      { op: 'M', x: 10, y: 20 },
      { op: 'L', x: 30, y: 20 },
      { op: 'L', x: 30, y: 40 },
      { op: 'L', x: 5, y: 5 },
      { op: 'Z' },
    ])
  })

  it('makes relative commands absolute (glyph paths)', () => {
    expect(parsePath('M 1 17 a 5.5 5.5 0 0 1 11 0')).toEqual([
      { op: 'M', x: 1, y: 17 },
      { op: 'A', rx: 5.5, ry: 5.5, largeArc: 0, sweep: 1, x: 12, y: 17 },
    ])
    expect(parsePath('M 0 0 l 2.4 2.5 l 4.6 -5')).toEqual([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 2.4, y: 2.5 },
      { op: 'L', x: 7, y: -2.5 },
    ])
  })

  it('treats coordinate pairs after M as implicit line-tos', () => {
    expect(parsePath('M 0 0 10 0 10 10')).toEqual([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 10, y: 0 },
      { op: 'L', x: 10, y: 10 },
    ])
  })

  it('parses quadratic curves (rounded stack corners)', () => {
    expect(parsePath('M 8 0 Q 0 0 0 8')).toEqual([
      { op: 'M', x: 8, y: 0 },
      { op: 'Q', x1: 0, y1: 0, x: 0, y: 8 },
    ])
  })
})

describe('arcCenter', () => {
  it('recovers the center of a half circle', () => {
    // Half circle radius 10 from (0,0) to (20,0), sweeping clockwise (y-down).
    const a = arcCenter(0, 0, 10, 10, 0, 1, 20, 0)
    expect(a.cx).toBeCloseTo(10, 5)
    expect(a.cy).toBeCloseTo(0, 5)
    expect(a.startDeg).toBeCloseTo(180, 3)
    expect(a.sweepDeg).toBeCloseTo(180, 3)
  })

  it('flips the sweep sign for counter-clockwise arcs', () => {
    const a = arcCenter(0, 0, 10, 10, 0, 0, 20, 0)
    expect(a.sweepDeg).toBeCloseTo(-180, 3)
  })
})

describe('pathBounds', () => {
  it('bounds straight segments exactly', () => {
    const b = pathBounds(parsePath('M 10 10 L 30 40 L 20 5'))
    expect(b).toEqual({ x: 10, y: 5, w: 20, h: 35 })
  })

  it('includes arc extremes beyond the endpoints', () => {
    // Sweep=1 from (0,0) to (20,0) passes over the top, through (10, -10).
    const b = pathBounds(parsePath('M 0 0 A 10 10 0 0 1 20 0'))
    expect(b.y).toBeCloseTo(-10, 3)
    expect(b.h).toBeCloseTo(10, 3)
  })
})

describe('custGeomXml', () => {
  it('emits a closed DrawingML path scaled to EMU', () => {
    const { xml, bbox } = custGeomXml(parsePath('M 0 0 L 100 0 L 100 50 Z'), 100)
    expect(bbox).toEqual({ x: 0, y: 0, w: 100, h: 50 })
    expect(xml).toContain('<a:path w="10000" h="5000">')
    expect(xml).toContain('<a:moveTo><a:pt x="0" y="0"/></a:moveTo>')
    expect(xml).toContain('<a:lnTo><a:pt x="10000" y="0"/></a:lnTo>')
    expect(xml).toContain('<a:close/>')
  })

  it('converts arcs to arcTo with 60000ths-of-a-degree angles', () => {
    const { xml } = custGeomXml(parsePath('M 0 0 A 10 10 0 0 1 20 0'), 1)
    expect(xml).toContain('stAng="10800000"') // 180°
    expect(xml).toContain('swAng="10800000"')
  })
})

describe('parsePaint', () => {
  it('normalizes hex and rgba paints', () => {
    expect(parsePaint('#FFAF2E')).toEqual({ hex: 'FFAF2E', alphaPct: 100 })
    expect(parsePaint('#fff')).toEqual({ hex: 'FFFFFF', alphaPct: 100 })
    expect(parsePaint('rgba(255,255,255,0.45)')).toEqual({ hex: 'FFFFFF', alphaPct: 45 })
    expect(parsePaint('rgba(29,79,145,0.03)')).toEqual({ hex: '1D4F91', alphaPct: 3 })
  })

  it('returns null for none / transparent / missing', () => {
    expect(parsePaint('none')).toBeNull()
    expect(parsePaint('transparent')).toBeNull()
    expect(parsePaint(null)).toBeNull()
  })
})
