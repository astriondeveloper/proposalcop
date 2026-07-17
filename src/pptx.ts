import { download, safeName, svgToPngBlob } from './export'

/*
 * Zero-dependency PowerPoint (.pptx) export. A .pptx is a ZIP of OOXML parts.
 *
 * The chart's SVG is transpiled element-by-element into native DrawingML
 * shapes and text boxes — rects, ellipses, lines and paths become real
 * PowerPoint shapes with fills and outlines, and every <text> becomes an
 * editable text box — so the exported slide can be recolored, retitled and
 * rearranged in PowerPoint. Every renderer draws with these primitives only,
 * so the transpiler covers all chart types. If transpilation ever fails, the
 * export falls back to the previous behavior: a high-resolution PNG picture.
 */

/* --------------------------------------------------------------- ZIP (store) */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/** Build a ZIP archive with the STORE method (no compression). Enough for
 *  OOXML, and keeps the writer tiny and dependency-free. */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder()
  const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff]
  const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
  // Fixed DOS timestamp (2020-01-01 00:00) so exports are reproducible.
  const dosTime = 0
  const dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1

  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const nameBytes = enc.encode(e.name)
    const crc = crc32(e.data)
    const size = e.data.length
    const local = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      ...u16(20), ...u16(0), ...u16(0),
      ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), ...u16(0),
    ])
    parts.push(local, nameBytes, e.data)
    central.push(
      new Uint8Array([
        0x50, 0x4b, 0x01, 0x02,
        ...u16(20), ...u16(20), ...u16(0), ...u16(0),
        ...u16(dosTime), ...u16(dosDate),
        ...u32(crc), ...u32(size), ...u32(size),
        ...u16(nameBytes.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0),
        ...u32(offset),
      ]),
      nameBytes,
    )
    offset += local.length + nameBytes.length + size
  }
  const centralStart = offset
  const centralSize = central.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,
    ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(centralStart), ...u16(0),
  ])

  const all = [...parts, ...central, eocd]
  const total = all.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const a of all) {
    out.set(a, p)
    p += a.length
  }
  return out
}

/* ----------------------------------------------------- path parsing (pure) */

export type PathCmd =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'Q'; x1: number; y1: number; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'A'; rx: number; ry: number; largeArc: number; sweep: number; x: number; y: number }
  | { op: 'Z' }

/**
 * Parse an SVG path into absolute commands. Supports the command set the
 * renderers emit (M L H V A Q C Z, upper and lower case); H/V are folded into
 * L and relative commands are made absolute.
 */
export function parsePath(d: string): PathCmd[] {
  const tokens = d.match(/[MLHVAQCZmlhvaqcz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  const cmds: PathCmd[] = []
  let i = 0
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let op = ''
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    const t = tokens[i]
    if (/^[a-zA-Z]$/.test(t)) {
      op = t
      i++
    }
    const rel = op === op.toLowerCase() && op !== 'Z' && op !== 'z'
    switch (op.toUpperCase()) {
      case 'M': {
        const nx = num() + (rel ? x : 0)
        const ny = num() + (rel ? y : 0)
        x = nx
        y = ny
        startX = nx
        startY = ny
        cmds.push({ op: 'M', x, y })
        // Subsequent pairs after M are implicit LineTos.
        op = rel ? 'l' : 'L'
        break
      }
      case 'L': {
        x = num() + (rel ? x : 0)
        y = num() + (rel ? y : 0)
        cmds.push({ op: 'L', x, y })
        break
      }
      case 'H': {
        x = num() + (rel ? x : 0)
        cmds.push({ op: 'L', x, y })
        break
      }
      case 'V': {
        y = num() + (rel ? y : 0)
        cmds.push({ op: 'L', x, y })
        break
      }
      case 'Q': {
        const x1 = num() + (rel ? x : 0)
        const y1 = num() + (rel ? y : 0)
        x = num() + (rel ? x : 0)
        y = num() + (rel ? y : 0)
        cmds.push({ op: 'Q', x1, y1, x, y })
        break
      }
      case 'C': {
        const x1 = num() + (rel ? x : 0)
        const y1 = num() + (rel ? y : 0)
        const x2 = num() + (rel ? x : 0)
        const y2 = num() + (rel ? y : 0)
        x = num() + (rel ? x : 0)
        y = num() + (rel ? y : 0)
        cmds.push({ op: 'C', x1, y1, x2, y2, x, y })
        break
      }
      case 'A': {
        const rx = num()
        const ry = num()
        num() // x-axis rotation: never used by the renderers
        const largeArc = num()
        const sweep = num()
        x = num() + (rel ? x : 0)
        y = num() + (rel ? y : 0)
        cmds.push({ op: 'A', rx, ry, largeArc, sweep, x, y })
        break
      }
      case 'Z': {
        x = startX
        y = startY
        cmds.push({ op: 'Z' })
        break
      }
      default:
        return cmds // unknown command: stop parsing defensively
    }
  }
  return cmds
}

/** SVG endpoint arc → center parametrization (angles in degrees, measured in
 *  the y-down frame both SVG and DrawingML use). */
export function arcCenter(
  x1: number,
  y1: number,
  rx0: number,
  ry0: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): { cx: number; cy: number; rx: number; ry: number; startDeg: number; sweepDeg: number } {
  let rx = Math.abs(rx0)
  let ry = Math.abs(ry0)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  // Scale radii up if the endpoints cannot be connected with these radii.
  const lam = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
  if (lam > 1) {
    const s = Math.sqrt(lam)
    rx *= s
    ry *= s
  }
  const sign = largeArc !== sweep ? 1 : -1
  const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx
  const den = rx * rx * dy * dy + ry * ry * dx * dx
  const co = sign * Math.sqrt(Math.max(0, num / den))
  const cxp = (co * rx * dy) / ry
  const cyp = (-co * ry * dx) / rx
  const cx = cxp + (x1 + x2) / 2
  const cy = cyp + (y1 + y2) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    let a = (Math.acos(Math.min(1, Math.max(-1, dot / len))) * 180) / Math.PI
    if (ux * vy - uy * vx < 0) a = -a
    return a
  }
  const startDeg = ang(1, 0, (x1 - cx) / rx, (y1 - cy) / ry)
  let sweepDeg = ang((x1 - cx) / rx, (y1 - cy) / ry, (x2 - cx) / rx, (y2 - cy) / ry)
  if (sweep === 0 && sweepDeg > 0) sweepDeg -= 360
  if (sweep === 1 && sweepDeg < 0) sweepDeg += 360
  return { cx, cy, rx, ry, startDeg, sweepDeg }
}

/** Bounding box of a parsed path, including arc axis-extremes and Bézier
 *  control points (a safe over-approximation for curves). */
export function pathBounds(cmds: PathCmd[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (px: number, py: number) => {
    minX = Math.min(minX, px)
    minY = Math.min(minY, py)
    maxX = Math.max(maxX, px)
    maxY = Math.max(maxY, py)
  }
  let cx = 0
  let cy = 0
  for (const c of cmds) {
    switch (c.op) {
      case 'M':
      case 'L':
        add(c.x, c.y)
        cx = c.x
        cy = c.y
        break
      case 'Q':
        add(c.x1, c.y1)
        add(c.x, c.y)
        cx = c.x
        cy = c.y
        break
      case 'C':
        add(c.x1, c.y1)
        add(c.x2, c.y2)
        add(c.x, c.y)
        cx = c.x
        cy = c.y
        break
      case 'A': {
        const a = arcCenter(cx, cy, c.rx, c.ry, c.largeArc, c.sweep, c.x, c.y)
        add(c.x, c.y)
        // Include axis extremes that fall inside the sweep.
        for (let k = -360; k <= 720; k += 90) {
          const within =
            a.sweepDeg >= 0
              ? k >= a.startDeg && k <= a.startDeg + a.sweepDeg
              : k <= a.startDeg && k >= a.startDeg + a.sweepDeg
          if (!within) continue
          const rad = (k * Math.PI) / 180
          add(a.cx + a.rx * Math.cos(rad), a.cy + a.ry * Math.sin(rad))
        }
        cx = c.x
        cy = c.y
        break
      }
      case 'Z':
        break
    }
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: Math.max(1e-6, maxX - minX), h: Math.max(1e-6, maxY - minY) }
}

/** Emit the DrawingML <a:custGeom> path list for a parsed path, in a local
 *  space whose origin is the path bbox top-left, scaled by `S` (EMU/px). */
export function custGeomXml(cmds: PathCmd[], S: number): { xml: string; bbox: { x: number; y: number; w: number; h: number } } {
  const bbox = pathBounds(cmds)
  const X = (v: number) => Math.round((v - bbox.x) * S)
  const Y = (v: number) => Math.round((v - bbox.y) * S)
  const W = Math.max(1, Math.round(bbox.w * S))
  const H = Math.max(1, Math.round(bbox.h * S))
  const deg = (v: number) => Math.round(v * 60000)
  let out = ''
  let cx = 0
  let cy = 0
  for (const c of cmds) {
    switch (c.op) {
      case 'M':
        out += `<a:moveTo><a:pt x="${X(c.x)}" y="${Y(c.y)}"/></a:moveTo>`
        cx = c.x
        cy = c.y
        break
      case 'L':
        out += `<a:lnTo><a:pt x="${X(c.x)}" y="${Y(c.y)}"/></a:lnTo>`
        cx = c.x
        cy = c.y
        break
      case 'Q':
        out += `<a:quadBezTo><a:pt x="${X(c.x1)}" y="${Y(c.y1)}"/><a:pt x="${X(c.x)}" y="${Y(c.y)}"/></a:quadBezTo>`
        cx = c.x
        cy = c.y
        break
      case 'C':
        out += `<a:cubicBezTo><a:pt x="${X(c.x1)}" y="${Y(c.y1)}"/><a:pt x="${X(c.x2)}" y="${Y(c.y2)}"/><a:pt x="${X(c.x)}" y="${Y(c.y)}"/></a:cubicBezTo>`
        cx = c.x
        cy = c.y
        break
      case 'A': {
        const a = arcCenter(cx, cy, c.rx, c.ry, c.largeArc, c.sweep, c.x, c.y)
        out += `<a:arcTo wR="${Math.max(1, Math.round(a.rx * S))}" hR="${Math.max(1, Math.round(a.ry * S))}" stAng="${deg(a.startDeg)}" swAng="${deg(a.sweepDeg)}"/>`
        cx = c.x
        cy = c.y
        break
      }
      case 'Z':
        out += '<a:close/>'
        break
    }
  }
  const xml = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${W}" b="${H}"/><a:pathLst><a:path w="${W}" h="${H}">${out}</a:path></a:pathLst></a:custGeom>`
  return { xml, bbox }
}

/* -------------------------------------------------------- color helpers */

/** Parse an SVG paint into hex + alpha%. Returns null for none/transparent. */
export function parsePaint(v: string | null): { hex: string; alphaPct: number } | null {
  if (!v || v === 'none' || v === 'transparent') return null
  const s = v.trim()
  if (s.startsWith('#')) {
    const c = s.slice(1)
    const full = c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c
    return { hex: full.slice(0, 6).toUpperCase(), alphaPct: 100 }
  }
  const m = s.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)$/)
  if (m) {
    const hex = [m[1], m[2], m[3]]
      .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
    const alphaPct = m[4] !== undefined ? Math.round(Number(m[4]) * 100) : 100
    return { hex, alphaPct }
  }
  if (s === 'white') return { hex: 'FFFFFF', alphaPct: 100 }
  if (s === 'black') return { hex: '000000', alphaPct: 100 }
  return null
}

function solidFill(hex: string, alphaPct: number, extraAlphaPct = 100): string {
  const a = Math.round((alphaPct * extraAlphaPct) / 100)
  const alpha = a < 100 ? `<a:alpha val="${a * 1000}"/>` : ''
  return `<a:solidFill><a:srgbClr val="${hex}">${alpha}</a:srgbClr></a:solidFill>`
}

/** The brand sky gradient (Refraction → Daylight → Zenith), horizontal. */
const GRAD_FILL =
  '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="1ED872"/></a:gs><a:gs pos="50000"><a:srgbClr val="4DD3F7"/></a:gs><a:gs pos="100000"><a:srgbClr val="9382F9"/></a:gs></a:gsLst><a:lin ang="0" scaled="1"/></a:gradFill>'

/* ---------------------------------------------------------- SVG walking */

interface Inherited {
  fill: string | null
  stroke: string | null
  strokeWidth: string | null
  strokeDasharray: string | null
  fontSize: string | null
  fontWeight: string | null
  fontStyle: string | null
  textAnchor: string | null
  opacity: number
  tx: number
  ty: number
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Read `translate(x, y)` / `rotate(a cx cy)` out of a transform attribute. */
function parseTransform(t: string | null): { tx: number; ty: number; rot: number } {
  const out = { tx: 0, ty: 0, rot: 0 }
  if (!t) return out
  const tr = t.match(/translate\(\s*(-?[\d.]+)[ ,]*(-?[\d.]+)?\s*\)/)
  if (tr) {
    out.tx = Number(tr[1])
    out.ty = Number(tr[2] ?? 0)
  }
  const ro = t.match(/rotate\(\s*(-?[\d.]+)/)
  if (ro) out.rot = Number(ro[1])
  return out
}

/** Transpile the live chart SVG into DrawingML shapes. `S` is EMU per px and
 *  (dx, dy) the slide offset in EMU. Returns spTree children XML. */
function svgToShapes(svgRoot: SVGSVGElement, S: number, dx: number, dy: number): string {
  let id = 10
  const shapes: string[] = []
  const svgW = svgRoot.viewBox.baseVal.width || svgRoot.clientWidth
  const svgH = svgRoot.viewBox.baseVal.height || svgRoot.clientHeight
  const PX = (v: number, off: number) => Math.round(v * S) + off
  const EXT = (v: number) => Math.max(1, Math.round(v * S))
  const ptSz = (px: number) => Math.max(100, Math.round((px * S) / 127)) // sz is pt*100

  const attr = (el: Element, name: string, inh: string | null) => el.getAttribute(name) ?? inh

  const lineXml = (
    stroke: { hex: string; alphaPct: number } | null,
    widthPx: number,
    dash: string | null,
    opacity: number,
    arrows: { head: boolean; tail: boolean },
  ) => {
    if (!stroke) return '<a:ln><a:noFill/></a:ln>'
    const w = Math.max(3175, Math.round(widthPx * S))
    return `<a:ln w="${w}" cap="rnd">${solidFill(stroke.hex, stroke.alphaPct, Math.round(opacity * 100))}${
      dash ? '<a:prstDash val="dash"/>' : ''
    }<a:round/>${arrows.head ? '<a:headEnd type="triangle" w="med" len="med"/>' : ''}${
      arrows.tail ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ''
    }</a:ln>`
  }

  const fillXml = (raw: string | null, opacity: number, fillOpacity: number) => {
    if (raw && raw.startsWith('url(')) return GRAD_FILL
    const p = parsePaint(raw)
    if (!p) return '<a:noFill/>'
    return solidFill(p.hex, p.alphaPct, Math.round(opacity * fillOpacity * 100))
  }

  const shapeSp = (
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    geom: string,
    fill: string,
    ln: string,
    rot = 0,
  ) => {
    const rotAttr = rot ? ` rot="${Math.round(rot * 60000)}"` : ''
    shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)} ${id++}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${rotAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>${geom}${fill}${ln}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`,
    )
  }

  const walk = (el: Element, inh: Inherited) => {
    if (el.hasAttribute('data-ui')) return
    const tag = el.tagName.toLowerCase()
    if (tag === 'defs' || tag === 'title' || tag === 'marker') return

    const t = parseTransform(el.getAttribute('transform'))
    const style: Inherited = {
      fill: el.getAttribute('fill') ?? inh.fill,
      stroke: el.getAttribute('stroke') ?? inh.stroke,
      strokeWidth: el.getAttribute('stroke-width') ?? inh.strokeWidth,
      strokeDasharray: el.getAttribute('stroke-dasharray') ?? inh.strokeDasharray,
      fontSize: el.getAttribute('font-size') ?? inh.fontSize,
      fontWeight: el.getAttribute('font-weight') ?? inh.fontWeight,
      fontStyle: el.getAttribute('font-style') ?? inh.fontStyle,
      textAnchor: el.getAttribute('text-anchor') ?? inh.textAnchor,
      opacity: inh.opacity * Number(el.getAttribute('opacity') ?? 1),
      tx: inh.tx + t.tx,
      ty: inh.ty + t.ty,
    }

    if (tag === 'g' || tag === 'svg') {
      for (const child of Array.from(el.children)) walk(child, style)
      return
    }

    const fillOpacity = Number(attr(el, 'fill-opacity', null) ?? 1)
    const strokePaint = style.stroke && style.stroke !== 'none' ? parsePaint(style.stroke) : null
    const strokeW = Number(style.strokeWidth ?? 1)
    const noArrows = { head: false, tail: false }

    if (tag === 'rect') {
      const x = Number(el.getAttribute('x') ?? 0) + style.tx
      const y = Number(el.getAttribute('y') ?? 0) + style.ty
      const w = Number(el.getAttribute('width') ?? 0)
      const h = Number(el.getAttribute('height') ?? 0)
      const rx = Number(el.getAttribute('rx') ?? 0)
      const fill = fillXml(style.fill, style.opacity, fillOpacity)
      if (fill === '<a:noFill/>' && !strokePaint) return // invisible hit area
      // The full-canvas white background is the slide's own background.
      if (x === 0 && y === 0 && w >= svgW && h >= svgH && style.fill?.toUpperCase() === '#FFFFFF') return
      const adj = rx > 0 ? Math.round((rx / (Math.min(w, h) / 2)) * 50000) : 0
      const geom =
        rx > 0
          ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, adj)}"/></a:avLst></a:prstGeom>`
          : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
      shapeSp('Rect', PX(x, dx), PX(y, dy), EXT(w), EXT(h), geom, fill, lineXml(strokePaint, strokeW, style.strokeDasharray, style.opacity, noArrows))
      return
    }

    if (tag === 'circle' || tag === 'ellipse') {
      const cx = Number(el.getAttribute('cx') ?? 0) + style.tx
      const cy = Number(el.getAttribute('cy') ?? 0) + style.ty
      const rx = Number(el.getAttribute(tag === 'circle' ? 'r' : 'rx') ?? 0)
      const ry = Number(el.getAttribute(tag === 'circle' ? 'r' : 'ry') ?? 0)
      const fill = fillXml(style.fill, style.opacity, fillOpacity)
      if (fill === '<a:noFill/>' && !strokePaint) return
      shapeSp(
        'Ellipse',
        PX(cx - rx, dx),
        PX(cy - ry, dy),
        EXT(rx * 2),
        EXT(ry * 2),
        '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>',
        fill,
        lineXml(strokePaint, strokeW, style.strokeDasharray, style.opacity, noArrows),
      )
      return
    }

    if (tag === 'line') {
      if (!strokePaint) return
      const x1 = Number(el.getAttribute('x1') ?? 0) + style.tx
      const y1 = Number(el.getAttribute('y1') ?? 0) + style.ty
      const x2 = Number(el.getAttribute('x2') ?? 0) + style.tx
      const y2 = Number(el.getAttribute('y2') ?? 0) + style.ty
      const cmds: PathCmd[] = [
        { op: 'M', x: x1, y: y1 },
        { op: 'L', x: x2, y: y2 },
      ]
      const { xml, bbox } = custGeomXml(cmds, S)
      shapeSp('Line', PX(bbox.x, dx), PX(bbox.y, dy), EXT(bbox.w), EXT(bbox.h), xml, '<a:noFill/>', lineXml(strokePaint, strokeW, style.strokeDasharray, style.opacity, noArrows))
      return
    }

    if (tag === 'path') {
      const d = el.getAttribute('d')
      if (!d) return
      const fill = fillXml(style.fill, style.opacity, fillOpacity)
      if (fill === '<a:noFill/>' && !strokePaint) return
      // Offset every coordinate by the accumulated translation.
      const cmds = parsePath(d).map((c): PathCmd => {
        const o = { ...c }
        if ('x' in o) {
          o.x += style.tx
          o.y += style.ty
        }
        if ('x1' in o) {
          o.x1 += style.tx
          o.y1 += style.ty
        }
        if ('x2' in o) {
          o.x2 += style.tx
          o.y2 += style.ty
        }
        return o
      })
      const { xml, bbox } = custGeomXml(cmds, S)
      const arrows = {
        head: el.getAttribute('marker-start') != null,
        tail: el.getAttribute('marker-end') != null,
      }
      shapeSp('Shape', PX(bbox.x, dx), PX(bbox.y, dy), EXT(bbox.w), EXT(bbox.h), xml, fill, lineXml(strokePaint, strokeW, style.strokeDasharray, style.opacity, arrows))
      return
    }

    if (tag === 'text') {
      const fontPx = Number(style.fontSize ?? 12)
      const anchor = style.textAnchor ?? 'start'
      // getBBox gives the rendered extents in local (pre-transform) coords.
      let bb: { x: number; y: number; width: number; height: number }
      try {
        bb = (el as SVGGraphicsElement).getBBox()
      } catch {
        return // detached / unrenderable
      }
      if (!el.textContent?.trim()) return
      const rotT = parseTransform(el.getAttribute('transform'))
      const bold = style.fontWeight === '700' || style.fontWeight === 'bold'
      const italic = style.fontStyle === 'italic'
      const fillP = parsePaint(style.fill ?? '#000000') ?? { hex: '000000', alphaPct: 100 }

      // One run per child node so bold tspan prefixes stay bold.
      const runs: string[] = []
      const runXml = (text: string, b: boolean) =>
        `<a:r><a:rPr lang="en-US" sz="${ptSz(fontPx)}" b="${b ? 1 : 0}" i="${italic ? 1 : 0}" dirty="0">${solidFill(fillP.hex, fillP.alphaPct)}<a:latin typeface="Verdana"/></a:rPr><a:t>${esc(text)}</a:t></a:r>`
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === 3) {
          if (child.textContent) runs.push(runXml(child.textContent, bold))
        } else if ((child as Element).tagName?.toLowerCase() === 'tspan') {
          const tw = (child as Element).getAttribute('font-weight')
          runs.push(runXml(child.textContent ?? '', tw === '700' || tw === 'bold' || bold))
        }
      }
      if (!runs.length) return

      const pad = 2 // guard against font-metric drift; wrap is off anyway
      const bx = bb.x - pad + style.tx
      const by = bb.y - 1 + style.ty
      const bw = bb.width + pad * 2
      const bh = bb.height + 2
      const algn = anchor === 'middle' ? 'ctr' : anchor === 'end' ? 'r' : 'l'
      const rotAttr = rotT.rot ? ` rot="${Math.round(rotT.rot * 60000)}"` : ''
      shapes.push(
        `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id++}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${rotAttr}><a:off x="${PX(bx, dx)}" y="${PX(by, dy)}"/><a:ext cx="${EXT(bw)}" cy="${EXT(bh)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="${algn}"/>${runs.join('')}</a:p></p:txBody></p:sp>`,
      )
      return
    }
  }

  const rootStyle: Inherited = {
    fill: null,
    stroke: null,
    strokeWidth: null,
    strokeDasharray: null,
    fontSize: null,
    fontWeight: null,
    fontStyle: null,
    textAnchor: null,
    opacity: 1,
    tx: 0,
    ty: 0,
  }
  for (const child of Array.from(svgRoot.children)) walk(child, rootStyle)
  return shapes.join('')
}

/* -------------------------------------------------------------- OOXML parts */

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const CONTENT_TYPES = `${decl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`

const ROOT_RELS = `${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`

function presentation(slideW: number, slideH: number): string {
  return `${decl}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${slideW}" cy="${slideH}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
}

const PRESENTATION_RELS = `${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${REL}/slide" Target="slides/slide1.xml"/></Relationships>`

const THEME = `${decl}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Astrion"><a:themeElements><a:clrScheme name="Astrion"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="222230"/></a:dk2><a:lt2><a:srgbClr val="F1E9DB"/></a:lt2><a:accent1><a:srgbClr val="442C81"/></a:accent1><a:accent2><a:srgbClr val="29AAE1"/></a:accent2><a:accent3><a:srgbClr val="1ED872"/></a:accent3><a:accent4><a:srgbClr val="4DD3F7"/></a:accent4><a:accent5><a:srgbClr val="9382F9"/></a:accent5><a:accent6><a:srgbClr val="FFAF2E"/></a:accent6><a:hlink><a:srgbClr val="307EEF"/></a:hlink><a:folHlink><a:srgbClr val="FC5442"/></a:folHlink></a:clrScheme><a:fontScheme name="Astrion"><a:majorFont><a:latin typeface="Verdana"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Verdana"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Astrion"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`

const EMPTY_TREE = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>`

const SLIDE_MASTER = `${decl}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${EMPTY_TREE}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`

const SLIDE_MASTER_RELS = `${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`

const SLIDE_LAYOUT = `${decl}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${EMPTY_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`

const SLIDE_LAYOUT_RELS = `${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`

const SLIDE_RELS_SHAPES = `${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`

const SLIDE_RELS_PICTURE = `${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/image" Target="../media/image1.png"/></Relationships>`

function shapesSlide(shapesXml: string): string {
  const tree = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapesXml}</p:spTree>`
  return `${decl}<p:sld ${NS}><p:cSld>${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

function pictureSlide(x: number, y: number, cx: number, cy: number): string {
  const pic = `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Chart"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  const tree = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${pic}</p:spTree>`
  return `${decl}<p:sld ${NS}><p:cSld>${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

/* ------------------------------------------------------------------ export */

const EMU_PER_IN = 914400
const SLIDE_W = Math.round(13.333 * EMU_PER_IN) // 16:9 widescreen
const SLIDE_H = Math.round(7.5 * EMU_PER_IN)
const MARGIN = Math.round(0.3 * EMU_PER_IN)

function packageEntries(slideXml: string, slideRels: string, media?: Uint8Array): ZipEntry[] {
  const enc = new TextEncoder()
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    { name: 'ppt/presentation.xml', data: enc.encode(presentation(SLIDE_W, SLIDE_H)) },
    { name: 'ppt/_rels/presentation.xml.rels', data: enc.encode(PRESENTATION_RELS) },
    { name: 'ppt/theme/theme1.xml', data: enc.encode(THEME) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: enc.encode(SLIDE_MASTER) },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: enc.encode(SLIDE_MASTER_RELS) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: enc.encode(SLIDE_LAYOUT) },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: enc.encode(SLIDE_LAYOUT_RELS) },
    { name: 'ppt/slides/slide1.xml', data: enc.encode(slideXml) },
    { name: 'ppt/slides/_rels/slide1.xml.rels', data: enc.encode(slideRels) },
  ]
  if (media) entries.push({ name: 'ppt/media/image1.png', data: media })
  return entries
}

function downloadPptx(zip: Uint8Array, title: string): void {
  // Copy into a fresh ArrayBuffer-backed view so the Blob type is unambiguous.
  download(
    new Blob([zip.slice()], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
    `${safeName(title)}.pptx`,
  )
}

/** Export the chart as a one-slide 16:9 .pptx built from native, editable
 *  PowerPoint shapes and text boxes. Falls back to an embedded PNG if the
 *  shape transpilation fails for any reason. */
export async function exportPptx(svgEl: SVGSVGElement, title: string): Promise<void> {
  try {
    const width = svgEl.viewBox.baseVal.width || svgEl.clientWidth
    const height = svgEl.viewBox.baseVal.height || svgEl.clientHeight
    const availW = SLIDE_W - 2 * MARGIN
    const availH = SLIDE_H - 2 * MARGIN
    const S = Math.min(availW / width, availH / height)
    const dx = Math.round((SLIDE_W - width * S) / 2)
    const dy = Math.round((SLIDE_H - height * S) / 2)
    const shapesXml = svgToShapes(svgEl, S, dx, dy)
    if (!shapesXml) throw new Error('no shapes')
    const zip = buildZip(packageEntries(shapesSlide(shapesXml), SLIDE_RELS_SHAPES))
    downloadPptx(zip, title)
  } catch {
    // Fallback: the previous behavior — the chart as a picture on the slide.
    const { blob, width, height } = await svgToPngBlob(svgEl, 2)
    const png = new Uint8Array(await blob.arrayBuffer())
    const availW = SLIDE_W - 2 * MARGIN
    const availH = SLIDE_H - 2 * MARGIN
    const ar = width / height
    let cx = availW
    let cy = Math.round(availW / ar)
    if (cy > availH) {
      cy = availH
      cx = Math.round(availH * ar)
    }
    const x = Math.round((SLIDE_W - cx) / 2)
    const y = Math.round((SLIDE_H - cy) / 2)
    const zip = buildZip(packageEntries(pictureSlide(x, y, cx, cy), SLIDE_RELS_PICTURE, png))
    downloadPptx(zip, title)
  }
}
