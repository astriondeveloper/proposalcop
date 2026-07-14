import { download, safeName, svgToCanvas } from './export'

/*
 * Zero-dependency single-page PDF export. The chart is rasterized to a
 * high-resolution image; its RGB pixels are deflated with the platform
 * CompressionStream and embedded as a /FlateDecode image XObject on a page
 * sized to the chart. Hand-assembled objects + xref, so no PDF library.
 */

/** zlib-deflate bytes using the built-in CompressionStream (no dependency). */
async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate')
  const writer = cs.writable.getWriter()
  void writer.write(data)
  void writer.close()
  const chunks: Uint8Array[] = []
  const reader = cs.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

/**
 * Assemble a one-page PDF whose only content is a full-page DeviceRGB image.
 * `img` is the already-deflated RGB pixel data (pxW×pxH, 8 bits/component);
 * the page is pageW×pageH points. Pure and synchronous, so it is unit-testable.
 */
export function buildPdf(
  img: Uint8Array,
  pxW: number,
  pxH: number,
  pageW: number,
  pageH: number,
): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  let len = 0
  const push = (u: Uint8Array | string) => {
    const b = typeof u === 'string' ? enc.encode(u) : u
    chunks.push(b)
    len += b.length
  }
  const offsets: number[] = []
  const beginObj = (n: number) => {
    offsets[n] = len
    push(`${n} 0 obj\n`)
  }

  // Header + binary marker so tools treat the file as binary.
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  beginObj(1)
  push('<</Type/Catalog/Pages 2 0 R>>\nendobj\n')
  beginObj(2)
  push('<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n')
  beginObj(3)
  push(
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pageW} ${pageH}]/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>\nendobj\n`,
  )

  beginObj(4)
  push(
    `<</Type/XObject/Subtype/Image/Width ${pxW}/Height ${pxH}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/FlateDecode/Length ${img.length}>>\nstream\n`,
  )
  push(img)
  push('\nendstream\nendobj\n')

  // Draw the unit image scaled to fill the page.
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q\n`
  beginObj(5)
  push(`<</Length ${content.length}>>\nstream\n`)
  push(content)
  push('endstream\nendobj\n')

  // Cross-reference table + trailer.
  const xrefStart = len
  const count = 6 // objects 0..5
  push(`xref\n0 ${count}\n`)
  push('0000000000 65535 f \n')
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<</Size ${count}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`)

  const out = new Uint8Array(len)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

/** Export the chart as a one-page PDF sized to the chart (1px = 1pt). */
export async function exportPdf(svgEl: SVGSVGElement, title: string): Promise<void> {
  const { canvas, width, height } = await svgToCanvas(svgEl, 2)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  // Drop alpha (the canvas is already composited on white) → packed RGB.
  const rgb = new Uint8Array((data.length / 4) * 3)
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i]
    rgb[j + 1] = data[i + 1]
    rgb[j + 2] = data[i + 2]
  }
  const compressed = await deflate(rgb)
  const pdf = buildPdf(compressed, canvas.width, canvas.height, Math.round(width), Math.round(height))
  download(new Blob([pdf.slice()], { type: 'application/pdf' }), `${safeName(title)}.pdf`)
}
