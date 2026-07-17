import type {
  CellStatus,
  CommLink,
  Direction,
  FlowStep,
  Group,
  LegendItem,
  OrgChart,
  OrgNode,
  RefKind,
  RiskItem,
  RiskLevel,
  StatIcon,
  XYSeriesKind,
} from './model'
import { clone, riskLevel, visit, wbsNumbers } from './model'
import { computeCompliance, REF_KIND_LABEL } from './compliance'
import { metrics as M, readableText, variantFill } from './theme'

/*
 * Deterministic layout engine. Pure functions: the same OrgChart always
 * produces the same geometry, so proposal charts are perfectly repeatable.
 *
 * The tidy-tree is computed in a direction-agnostic (main, cross) space —
 * `main` is the flow/depth axis (parent -> child) and `cross` is the axis
 * siblings spread along. A final mapping turns (main, cross) into screen
 * (x, y) for the chosen flow Direction (top-down, bottom-up, left-right,
 * right-left). Boxes are never rotated; only their placement changes.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface DetailBlock {
  lines: string[]
  h: number
}

export interface PlacedNode {
  node: OrgNode
  x: number
  y: number
  w: number
  /** Height of the colored header block. */
  headerH: number
  /** Header + detail rows. */
  totalH: number
  titleLines: string[]
  /** Left-align the title (boxes with names/bullets) vs centered. */
  leftAlign: boolean
  bulletLines: { text: string; first: boolean }[]
  detailBlocks: DetailBlock[]
}

export interface Zone {
  group: Group
  rect: Rect
}

export interface CommPath {
  link: CommLink
  path: string
  /** Midpoint between the two connected boxes, for an optional edge label. */
  labelPos: { x: number; y: number }
}

export interface LegendLayout {
  x: number
  y: number
  w: number
  h: number
  items: LegendItem[]
}

/** A gap shown in the compliance panel (an unowned requirement). */
export interface OverlayGap {
  kind: RefKind
  ref: string
  title?: string
}

/** On-chart compliance overlay: per-box status + a coverage/gaps panel.
 *  Present only when meta.showComplianceOverlay is on and a register exists. */
export interface ComplianceOverlay {
  coverage: { covered: number; total: number; pct: number }
  gaps: OverlayGap[]
  /** How many gaps beyond those in {@link gaps} exist (panel is capped). */
  gapsMore: number
  /** Ids of boxes carrying at least one reference absent from the register. */
  orphanNodeIds: string[]
  panel: Rect
}

/** One task bar in the transition-schedule (timeline) layout. */
export interface TimelineBar {
  node: OrgNode
  label: string
  depth: number
  y: number
  rowH: number
  milestone: boolean
  barX: number
  barW: number
  fill: string
  text: string
}

/** A workstream swimlane band behind the schedule rows, from a group. */
export interface TimelineBand {
  label: string
  y: number
  h: number
  style: Group['style']
}

/** Geometry for the 'timeline' layout: a Gantt-style schedule. */
export interface TimelineLayout {
  gutter: number
  plotX: number
  plotW: number
  axisY: number
  top: number
  rowH: number
  rowGap: number
  bars: TimelineBar[]
  bands: TimelineBand[]
  ticks: { x: number; label: string }[]
  phases: { label: string; x: number }[]
  unit: 'day' | 'week' | 'month'
  span: number
}

/** Wrapped action caption beneath the graphic (carried into exports). */
export interface CaptionLayout {
  lines: string[]
  x: number
  y: number
  w: number
  h: number
}

/** Win-theme banner strip above the graphic. */
export interface WinThemeLayout {
  lines: string[]
  x: number
  y: number
  w: number
  h: number
}

export interface StatTileLayout {
  icon?: StatIcon
  value: string
  label: string
  x: number
  w: number
}

/** Icon-based stat strip beneath the graphic. */
export interface StatStripLayout {
  x: number
  y: number
  w: number
  h: number
  tiles: StatTileLayout[]
}

/** Customer / PWS pull-quote callout beneath the graphic. */
export interface QuoteLayout {
  lines: string[]
  source: string | null
  x: number
  y: number
  w: number
  h: number
}

export interface TableColLayout {
  label: string
  headerLines: string[]
  x: number
  w: number
  align: 'left' | 'center' | 'right'
}

export interface TableCellLayout {
  lines: string[]
  status?: CellStatus
  align: 'left' | 'center' | 'right'
}

export interface TableRowLayout {
  y: number
  h: number
  header: boolean
  cells: TableCellLayout[]
}

/** Geometry for the 'table' layout: a branded grid. */
export interface TableLayout {
  x: number
  y: number
  headerH: number
  zebra: boolean
  totalW: number
  columns: TableColLayout[]
  rows: TableRowLayout[]
}

/** One marker on the risk cube: the current position, plus the residual
 *  (post-mitigation) position and connecting arrow when one is set. */
export interface RiskMarkerLayout {
  id: string
  code: string
  title: string
  cx: number
  cy: number
  level: RiskLevel
  residual?: { cx: number; cy: number; level: RiskLevel }
}

/** One row in the risk-register panel beside the cube. */
export interface RiskListRow {
  id: string
  code: string
  title: string
  /** Position summary, e.g. "L4·C4 → L2·C3". */
  move: string
  level: RiskLevel
  y: number
}

/** Geometry for the 'risk' layout: a 5×5 likelihood × consequence heatmap. */
export interface RiskCubeLayout {
  x: number
  y: number
  cellSize: number
  cells: { row: number; col: number; x: number; y: number; level: RiskLevel }[]
  markers: RiskMarkerLayout[]
  xLabel: string
  yLabel: string
  plotW: number
  plotH: number
  panel: { x: number; y: number; w: number; h: number; rows: RiskListRow[] } | null
}

/** One rendered series on the xy layout. Geometry is pre-computed here so the
 *  renderer only paints paths and rects. */
export interface XYSeriesLayout {
  id: string
  label: string
  kind: XYSeriesKind
  fill: string
  /** Polyline through the data points (line and area series). */
  linePath?: string
  /** Closed region down to the zero baseline (area series). */
  areaPath?: string
  /** One rect per point (bar series), already offset for grouping. */
  bars?: Rect[]
  /** Screen positions of the data points (marker dots for line/area). */
  dots: { x: number; y: number }[]
}

export interface XYLegendItem {
  /** Id of the series this entry represents. */
  id: string
  label: string
  fill: string
  kind: XYSeriesKind
  x: number
  y: number
}

/** Geometry for the 'xy' layout: line / area / bar series over numeric axes. */
export interface XYLayout {
  x: number
  y: number
  plotW: number
  plotH: number
  xLabel: string | null
  yLabel: string | null
  xTicks: { x: number; label: string }[]
  yTicks: { y: number; label: string }[]
  /** Screen y of the zero baseline (bars and areas grow from here). */
  zeroY: number
  series: XYSeriesLayout[]
  legend: XYLegendItem[]
}

/** One rendered flow step: a cycle segment, pipeline chevron, or stack layer.
 *  `path` is the clickable filled shape; labels are pre-wrapped. */
export interface FlowStepLayout {
  id: string
  path: string
  fill: string
  text: string
  titleLines: string[]
  /** Title anchor (centered). */
  labelX: number
  labelY: number
  /** Supporting text, positioned per mode (outside ring / under chevron /
   *  inside layer). */
  detail: { lines: string[]; x: number; y: number; anchor: 'start' | 'middle' | 'end' } | null
}

/** Geometry for the 'cycle' / 'pipeline' / 'stack' layouts. */
export interface FlowLayout {
  kind: 'cycle' | 'pipeline' | 'stack'
  steps: FlowStepLayout[]
  /** Center label of a cycle. */
  hub: { lines: string[]; x: number; y: number } | null
}

export interface Layout {
  placed: PlacedNode[]
  /** Reporting-line connector paths. */
  connectors: string[]
  zones: Zone[]
  comms: CommPath[]
  legend: LegendLayout | null
  title: { text: string; x: number; y: number; w: number } | null
  compliance: ComplianceOverlay | null
  /** Transition-schedule geometry when the 'timeline' layout is active. */
  timeline: TimelineLayout | null
  /** Table geometry when the 'table' layout is active. */
  table: TableLayout | null
  /** Risk-cube geometry when the 'risk' layout is active. */
  risk: RiskCubeLayout | null
  /** XY-chart geometry when the 'xy' layout is active. */
  xy: XYLayout | null
  /** Flow geometry when a 'cycle' / 'pipeline' / 'stack' layout is active. */
  flow: FlowLayout | null
  caption: CaptionLayout | null
  /** Win-theme banner strip above the graphic (persuasion layer). */
  winTheme: WinThemeLayout | null
  /** Vertical offset the renderer applies to the content group so the
   *  win-theme strip has room at the top. 0 when there is no strip. */
  contentShift: number
  /** Icon-based stat strip beneath the graphic (persuasion layer). */
  stats: StatStripLayout | null
  /** Pull-quote callout beneath the graphic (persuasion layer). */
  quote: QuoteLayout | null
  /** Classification / CUI marking text, rendered as top + bottom banners. */
  banner: string | null
  width: number
  height: number
}

const CAPTION_SIZE = 12
const CAPTION_LH = 17
const CAPTION_MAXW = 860

/** Lay out the chart's action caption below the content, wrapped to the content
 *  width (bounded). Returns null when there is no caption. */
function captionLayout(chart: OrgChart, contentW: number, bottomY: number): CaptionLayout | null {
  const text = chart.meta.caption?.trim()
  if (!text) return null
  const w = Math.max(240, Math.min(CAPTION_MAXW, contentW))
  const lines = wrapText(text, CAPTION_SIZE, w)
  return { lines, x: M.canvasPad, y: bottomY + 18, w, h: lines.length * CAPTION_LH }
}

/* Persuasion-layer metrics. */
const WT_SIZE = 14
const WT_LH = 20
const WT_PAD_X = 16
const WT_PAD_Y = 11
const WT_GAP = 16 // gap between the strip and the shifted content
const STAT_VALUE_SIZE = 21
const STAT_LABEL_SIZE = 10.5
const STAT_TILE_H = 52
const STAT_PAD_X = 18
const QUOTE_SIZE = 12.5
const QUOTE_LH = 18
const QUOTE_MAXW = 720

/** The persuasion adornments plus the final canvas bounds. Shared by every
 *  layout strategy so the win theme / stats / quote / caption stack renders
 *  identically over node charts and data charts. */
interface AdornedTail {
  winTheme: WinThemeLayout | null
  contentShift: number
  stats: StatStripLayout | null
  quote: QuoteLayout | null
  caption: CaptionLayout | null
  width: number
  height: number
}

/**
 * Lay out the persuasion stack around already-computed content: the win-theme
 * strip above (content is shifted down by `contentShift`), then stats, pull
 * quote, and caption stacked beneath `contentBottom`, all in content
 * coordinates. Also resolves the final canvas width/height.
 */
function adornAndBound(chart: OrgChart, rightEdge: number, contentBottom: number): AdornedTail {
  const contentW = Math.max(320, rightEdge - M.canvasPad)

  // Win-theme strip at the very top; the renderer shifts everything else down.
  let winTheme: WinThemeLayout | null = null
  let contentShift = 0
  const wt = chart.meta.winTheme?.trim()
  if (wt) {
    const lines = wrapText(wt, WT_SIZE, contentW - WT_PAD_X * 2 - 6, true)
    winTheme = {
      lines,
      x: M.canvasPad,
      y: M.canvasPad,
      w: contentW,
      h: lines.length * WT_LH + WT_PAD_Y * 2,
    }
    contentShift = winTheme.h + WT_GAP
  }

  // Stat strip beneath the content.
  let stats: StatStripLayout | null = null
  let cursor = contentBottom
  const items = chart.meta.stats ?? []
  if (items.length) {
    const tiles: StatTileLayout[] = []
    let x = M.canvasPad
    for (const s of items) {
      const iconW = s.icon ? 26 : 0
      // Labels render all-caps, so measure the uppercased text.
      const w =
        Math.max(
          88,
          iconW + textWidth(s.value, STAT_VALUE_SIZE, true) + 8,
          textWidth(s.label.toUpperCase(), STAT_LABEL_SIZE) + 8,
        ) + STAT_PAD_X * 2
      tiles.push({ ...(s.icon ? { icon: s.icon } : {}), value: s.value, label: s.label, x, w })
      x += w
    }
    stats = { x: M.canvasPad, y: cursor + 24, w: x - M.canvasPad, h: STAT_TILE_H, tiles }
    cursor = stats.y + stats.h
  }

  // Pull quote beneath the stats.
  let quote: QuoteLayout | null = null
  if (chart.meta.quote?.text) {
    const w = Math.max(240, Math.min(QUOTE_MAXW, contentW))
    const lines = wrapText(`“${chart.meta.quote.text}”`, QUOTE_SIZE, w - 16)
    const source = chart.meta.quote.source ?? null
    quote = {
      lines,
      source,
      x: M.canvasPad,
      y: cursor + 20,
      w,
      h: lines.length * QUOTE_LH + (source ? 17 : 0) + 6,
    }
    cursor = quote.y + quote.h
  }

  const caption = captionLayout(chart, contentW, cursor)
  const bottom = caption ? caption.y + caption.h : cursor
  const width =
    Math.max(rightEdge, stats ? stats.x + stats.w : 0, quote ? quote.x + quote.w : 0, caption ? caption.x + caption.w : 0) +
    M.canvasPad
  return { winTheme, contentShift, stats, quote, caption, width, height: contentShift + bottom + M.canvasPad }
}

/* ---------------------------------------------------------- text metrics */

const NARROW = new Set([...`iIljtfr.,;:!'"()[]|/ `])
const WIDE = new Set([...'mwMW@%&'])

// Average glyph widths tuned for Verdana (the brand-standard fallback for
// Obvia), which runs wider than most UI fonts.
export function textWidth(s: string, size: number, bold = false): number {
  let w = 0
  for (const ch of s) {
    if (NARROW.has(ch)) w += 0.36
    else if (WIDE.has(ch)) w += 0.98
    else if (ch >= 'A' && ch <= 'Z') w += 0.78
    else if (ch >= '0' && ch <= '9') w += 0.64
    else w += 0.58
  }
  return w * size * (bold ? 1.09 : 1)
}

export function wrapText(text: string, size: number, maxW: number, bold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (textWidth(candidate, size, bold) <= maxW || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/* ------------------------------------------------------------- measuring */

interface Measured {
  node: OrgNode
  w: number
  headerH: number
  totalH: number
  titleLines: string[]
  leftAlign: boolean
  bulletLines: { text: string; first: boolean }[]
  detailBlocks: DetailBlock[]
  children: Measured[]
  /** Box extent along the flow axis and the sibling axis. */
  mainSize: number
  crossSize: number
  /** Full subtree extent along each axis. */
  subMain: number
  subCross: number
}

function measureNode(node: OrgNode, vertical: boolean): Measured {
  const hidden = node.variant === 'hidden'
  const w = hidden ? 0 : (node.width ?? M.boxWidth)
  const hasBadge = (node.badges ?? []).length > 0
  const photoPad = node.photo ? 38 : 0
  const contentW = Math.max(40, w - M.padX * 2 - photoPad - (hasBadge ? 14 : 0))

  const titleLines = hidden ? [] : wrapText(node.title, M.titleSize, contentW, true)
  const bulletLines: { text: string; first: boolean }[] = []
  for (const b of node.bullets ?? []) {
    const lines = wrapText(b, M.bulletSize, contentW - 12)
    lines.forEach((text, i) => bulletLines.push({ text, first: i === 0 }))
  }
  const leftAlign = (node.bullets ?? []).length > 0 || !!node.name

  let headerH = 0
  if (!hidden) {
    headerH =
      M.padY * 2 +
      titleLines.length * M.titleLineH +
      (node.name ? M.nameLineH : 0) +
      (bulletLines.length ? 6 + bulletLines.length * M.bulletLineH : 0)
    // Architecture shapes need headroom for their silhouettes to read.
    const shapeMin =
      node.shape === 'cloud' || node.shape === 'diamond' ? 58 : node.shape === 'cylinder' ? 54 : 0
    headerH = Math.max(headerH, node.photo ? 52 : M.minHeaderH, shapeMin)
  }

  const detailBlocks: DetailBlock[] = []
  for (const d of node.details ?? []) {
    const combined = d.label ? `${d.label} ${d.text}` : d.text
    const lines = wrapText(combined, M.detailSize, w - M.padX * 2)
    detailBlocks.push({ lines, h: lines.length * M.detailLineH + M.detailPadY * 2 })
  }
  const totalH = headerH + detailBlocks.reduce((s, b) => s + b.h, 0)

  // The box occupies `totalH` vertically and `w` horizontally. Which of those
  // is "along the flow" (main) vs "across siblings" (cross) depends on flow.
  const mainSize = vertical ? totalH : w
  const crossSize = vertical ? w : totalH

  const children = (node.children ?? []).map((c) => measureNode(c, vertical))
  const layoutMode = node.childLayout ?? 'row'
  const levelGap = hidden ? 0 : M.levelGap
  const stackGap = hidden ? 0 : M.stackGap
  const indent = hidden ? 0 : M.stackIndent

  let subCross = crossSize
  let subMain = mainSize
  if (children.length) {
    if (layoutMode === 'stack') {
      const maxChildCross = Math.max(...children.map((c) => c.subCross))
      subCross = Math.max(crossSize, indent + maxChildCross)
      subMain = mainSize + children.reduce((s, c) => s + (stackGap || M.stackGap) + c.subMain, 0)
    } else {
      const rowCross =
        children.reduce((s, c) => s + c.subCross, 0) + M.siblingGap * (children.length - 1)
      subCross = Math.max(crossSize, rowCross)
      subMain = mainSize + levelGap + Math.max(...children.map((c) => c.subMain))
    }
  }

  return {
    node,
    w,
    headerH,
    totalH,
    titleLines,
    leftAlign,
    bulletLines,
    detailBlocks,
    children,
    mainSize,
    crossSize,
    subMain,
    subCross,
  }
}

/* --------------------------------------------------------------- placing */

/** A node placed in logical (main, cross) space, mapped to screen later. */
interface Raw {
  m: Measured
  main: number
  cross: number
}

/** A connector is a polyline of [cross, main] points in logical space. */
type Polyline = [number, number][]

function placeNode(
  m: Measured,
  cross: number,
  main: number,
  raw: Raw[],
  conns: Polyline[],
): { center: number } {
  const hidden = m.node.variant === 'hidden'
  const layoutMode = m.node.childLayout ?? 'row'

  let nodeCross = cross + (m.subCross - m.crossSize) / 2
  if (layoutMode === 'stack') nodeCross = cross

  if (m.children.length && layoutMode === 'row') {
    const rowCross =
      m.children.reduce((s, c) => s + c.subCross, 0) + M.siblingGap * (m.children.length - 1)
    let childCross = cross + (m.subCross - rowCross) / 2
    const childMain = main + m.mainSize + (hidden ? 0 : M.levelGap)
    const centers: number[] = []
    for (const c of m.children) {
      const r = placeNode(c, childCross, childMain, raw, conns)
      centers.push(r.center)
      childCross += c.subCross + M.siblingGap
    }
    // Center the parent box over its children's centers.
    const mid = (centers[0] + centers[centers.length - 1]) / 2
    nodeCross = Math.max(cross, Math.min(mid - m.crossSize / 2, cross + m.subCross - m.crossSize))
    if (!hidden) {
      const pc = nodeCross + m.crossSize / 2
      const busMain = main + m.mainSize + M.levelGap / 2
      conns.push([
        [pc, main + m.mainSize],
        [pc, busMain],
      ])
      if (centers.length > 1 || Math.abs(centers[0] - pc) > 0.5) {
        conns.push([
          [Math.min(pc, ...centers), busMain],
          [Math.max(pc, ...centers), busMain],
        ])
      }
      for (const cc of centers) {
        conns.push([
          [cc, busMain],
          [cc, childMain],
        ])
      }
    }
  } else if (m.children.length && layoutMode === 'stack') {
    const indent = hidden ? 0 : M.stackIndent
    const spineCross = nodeCross + indent / 2
    let cm = main + m.mainSize + M.stackGap
    let lastMidMain = cm
    for (const c of m.children) {
      placeNode(c, nodeCross + indent, cm, raw, conns)
      lastMidMain = cm + Math.min(c.mainSize || c.subMain, 40) / 2
      if (!hidden) {
        conns.push([
          [spineCross, lastMidMain],
          [nodeCross + indent, lastMidMain],
        ])
      }
      cm += c.subMain + M.stackGap
    }
    if (!hidden) {
      conns.push([
        [spineCross, main + m.mainSize],
        [spineCross, lastMidMain],
      ])
    }
  }

  if (!hidden) raw.push({ m, main, cross: nodeCross })
  return { center: nodeCross + (m.crossSize || m.subCross) / 2 }
}

/* ---------------------------------------------------------------- extras */

function subtreeIds(node: OrgNode): string[] {
  const out: string[] = [node.id]
  for (const c of node.children ?? []) out.push(...subtreeIds(c))
  return out
}

function indexById(placed: PlacedNode[]): Map<string, PlacedNode> {
  const m = new Map<string, PlacedNode>()
  for (const p of placed) m.set(p.node.id, p)
  return m
}

function boxOf(byId: Map<string, PlacedNode>, id: string): Rect | null {
  const p = byId.get(id)
  return p ? { x: p.x, y: p.y, w: p.w, h: p.totalH } : null
}

function routeComm(a: Rect, b: Rect): string {
  const aCx = a.x + a.w / 2
  const bCx = b.x + b.w / 2
  if (b.x >= a.x + a.w + 12) {
    // B is to the right.
    const sy = a.y + a.h / 2
    const ey = b.y + b.h / 2
    const sx = a.x + a.w
    const ex = b.x
    const midX = (sx + ex) / 2
    return sy === ey
      ? `M ${sx} ${sy} H ${ex}`
      : `M ${sx} ${sy} H ${midX} V ${ey} H ${ex}`
  }
  if (a.x >= b.x + b.w + 12) {
    const sy = a.y + a.h / 2
    const ey = b.y + b.h / 2
    const sx = a.x
    const ex = b.x + b.w
    const midX = (sx + ex) / 2
    return sy === ey
      ? `M ${sx} ${sy} H ${ex}`
      : `M ${sx} ${sy} H ${midX} V ${ey} H ${ex}`
  }
  // Vertically related.
  if (b.y >= a.y + a.h) {
    const midY = (a.y + a.h + b.y) / 2
    return `M ${aCx} ${a.y + a.h} V ${midY} H ${bCx} V ${b.y}`
  }
  const midY = (b.y + b.h + a.y) / 2
  return `M ${aCx} ${a.y} V ${midY} H ${bCx} V ${b.y + b.h}`
}

const LEGEND_ITEM_H = 24
const LEGEND_PAD = 12

/* Compliance overlay panel metrics. */
const CPANEL_PAD = 12
const CPANEL_HEADER_H = 52
const CPANEL_GAP_H = 18
const CPANEL_MAX_GAPS = 12

// textWidth() is deliberately generous so boxes never clip their text; that
// padding is invisible inside a box, but the headline accent bar sits directly
// under the rendered title, so scale the estimate to track the rendered glyph
// run. Kept close to 1 so the bar reaches the last word (Obvia, the brand
// font, renders a touch wider than the Verdana-tuned estimate) without a
// noticeable overshoot.
const TITLE_BAR_SCALE = 0.9

/** The chart headline (all-caps, size 20 bold) with its accent-bar width, or
 *  null when the title is hidden/empty. Shared by every layout strategy. */
function titleBlock(chart: OrgChart): Layout['title'] {
  if (!(chart.meta.showTitle && chart.meta.title.trim())) return null
  return {
    text: chart.meta.title,
    x: M.canvasPad,
    y: M.canvasPad + 22,
    w: textWidth(chart.meta.title.toUpperCase(), 20, true) * TITLE_BAR_SCALE,
  }
}

/** Shared tail for the data layouts (timeline / table / risk / xy): lays out
 *  the persuasion stack + caption, computes the canvas bounds, and fills the
 *  node-layout fields with empty defaults. `parts` carries the layout-specific
 *  geometry. */
function finishDataLayout(
  chart: OrgChart,
  contentRight: number,
  contentBottom: number,
  parts: Partial<Layout>,
): Layout {
  const adorned = adornAndBound(chart, contentRight, contentBottom)
  return {
    placed: [],
    connectors: [],
    zones: [],
    comms: [],
    legend: null,
    title: titleBlock(chart),
    compliance: null,
    timeline: null,
    table: null,
    risk: null,
    xy: null,
    flow: null,
    banner: chart.meta.banner ?? null,
    ...adorned,
    ...parts,
  }
}

/** Shared tail: build zones, edges, legend, title, and bounds from already
 *  positioned boxes + connectors. Used by every layout strategy. */
function assemble(chart: OrgChart, placed: PlacedNode[], connectors: string[]): Layout {
  // Index once so zone/edge lookups are O(1) instead of scanning `placed`.
  const byId = indexById(placed)

  // Zones behind member subtrees (computed from final screen rects).
  const zones: Zone[] = []
  for (const g of chart.groups) {
    const ids = new Set<string>()
    for (const memberId of g.memberIds) {
      const node = byId.get(memberId)?.node
      if (node) subtreeIds(node).forEach((i) => ids.add(i))
    }
    let x1 = Infinity
    let y1 = Infinity
    let x2 = -Infinity
    let y2 = -Infinity
    for (const id of ids) {
      const b = byId.get(id)
      if (!b) continue
      x1 = Math.min(x1, b.x)
      y1 = Math.min(y1, b.y)
      x2 = Math.max(x2, b.x + b.w)
      y2 = Math.max(y2, b.y + b.totalH)
    }
    if (x1 === Infinity) continue
    zones.push({
      group: g,
      rect: { x: x1 - M.zonePad, y: y1 - M.zonePad, w: x2 - x1 + 2 * M.zonePad, h: y2 - y1 + 2 * M.zonePad },
    })
  }

  // Edges (communication / graph connections). Edges sharing a node pair
  // (e.g. a flow and its rework return) fan their labels out vertically so
  // they never stack on the same midpoint.
  const comms: CommPath[] = []
  const pairCount = new Map<string, number>()
  const pairKey = (l: CommLink) => [l.fromId, l.toId].sort().join('→')
  for (const link of chart.comms) {
    const k = pairKey(link)
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1)
  }
  const pairSeen = new Map<string, number>()
  for (const link of chart.comms) {
    const a = boxOf(byId, link.fromId)
    const b = boxOf(byId, link.toId)
    if (a && b) {
      const k = pairKey(link)
      const idx = pairSeen.get(k) ?? 0
      pairSeen.set(k, idx + 1)
      const n = pairCount.get(k)!
      const labelPos = {
        x: (a.x + a.w / 2 + b.x + b.w / 2) / 2,
        y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 + (idx - (n - 1) / 2) * 20,
      }
      comms.push({ link, path: routeComm(a, b), labelPos })
    }
  }

  // Content bounds.
  const x2s = placed.map((p) => p.x + p.w).concat(zones.map((z) => z.rect.x + z.rect.w))
  const y2s = placed.map((p) => p.y + p.totalH).concat(zones.map((z) => z.rect.y + z.rect.h))
  const ys = placed.map((p) => p.y).concat(zones.map((z) => z.rect.y))
  const maxX = x2s.length ? Math.max(...x2s) : 400
  const maxY = y2s.length ? Math.max(...y2s) : 300
  const minY = ys.length ? Math.min(...ys) : M.canvasPad

  // Legend to the right of content.
  let legend: LegendLayout | null = null
  if (chart.legend.length) {
    const w =
      Math.max(
        textWidth('Legend', 12, true),
        ...chart.legend.map((l) => textWidth(l.label, 11)),
      ) +
      LEGEND_PAD * 2 +
      30
    const h = LEGEND_PAD * 2 + 18 + chart.legend.length * LEGEND_ITEM_H
    legend = { x: maxX + M.legendGap, y: minY, w, h, items: chart.legend }
  }

  // Headlines render all-caps at size 20 bold; measure that so the accent bar
  // (and the canvas) can size to the actual title width.
  const title = titleBlock(chart)

  // On-chart compliance overlay (opt-in): a coverage/gaps panel placed under
  // the content so it grows the canvas like the legend, plus the node ids the
  // renderer badges. Only built when enabled and a register exists.
  let compliance: ComplianceOverlay | null = null
  if (chart.meta.showComplianceOverlay && (chart.compliance?.requirements?.length ?? 0) > 0) {
    const report = computeCompliance(chart)
    const allGaps = report.rows.filter((r) => r.status === 'gap').map((r) => r.requirement)
    const gaps: OverlayGap[] = allGaps
      .slice(0, CPANEL_MAX_GAPS)
      .map((r) => ({ kind: r.kind, ref: r.ref, title: r.title }))
    const gapsMore = allGaps.length - gaps.length
    const orphanNodeIds = [...new Set(report.orphans.map((o) => o.nodeId))]

    const headerLine = `Compliance coverage — ${report.coverage.pct}%`
    const countLine = `${report.coverage.covered} of ${report.coverage.total} requirements covered`
    const gapsTitle = gaps.length ? `Gaps (${allGaps.length})` : 'No gaps — every requirement is owned'
    const gapLine = (g: OverlayGap) => `${REF_KIND_LABEL[g.kind]} ${g.ref}${g.title ? ` — ${g.title}` : ''}`
    // Gap lines are bullet-indented (~15px) in the renderer, so budget for it
    // here or the longest gap title would be truncated inside its own panel.
    const widest = Math.max(
      textWidth(headerLine, 13, true),
      textWidth(countLine, 11),
      textWidth(gapsTitle, 11, true),
      ...gaps.map((g) => textWidth(gapLine(g), 11) + 15),
    )
    const w = Math.min(440, Math.max(240, widest + CPANEL_PAD * 2))
    const gapsBlockH = gaps.length ? 22 + gaps.length * CPANEL_GAP_H + (gapsMore > 0 ? 16 : 0) : 20
    const h = CPANEL_PAD * 2 + CPANEL_HEADER_H + gapsBlockH
    compliance = {
      coverage: report.coverage,
      gaps,
      gapsMore,
      orphanNodeIds,
      panel: { x: M.canvasPad, y: maxY + 26, w, h },
    }
  }

  const contentRight = legend ? legend.x + legend.w : maxX
  const titleRight = title ? title.x + title.w : 0
  const complianceRight = compliance ? compliance.panel.x + compliance.panel.w : 0
  const complianceBottom = compliance ? compliance.panel.y + compliance.panel.h : 0
  const rightEdge = Math.max(contentRight, titleRight, complianceRight)
  const contentBottom = Math.max(maxY, legend ? legend.y + legend.h : 0, complianceBottom)
  const adorned = adornAndBound(chart, rightEdge, contentBottom)

  return {
    placed,
    connectors,
    zones,
    comms,
    legend,
    title,
    compliance,
    timeline: null,
    table: null,
    risk: null,
    xy: null,
    flow: null,
    banner: chart.meta.banner ?? null,
    ...adorned,
  }
}

/* --------------------------------------------------- manual overrides */

/** Move any box that carries a manual `pos` to that position. Returns true if
 *  at least one box moved, so the caller knows connectors must be re-routed. */
function applyOverrides(placed: PlacedNode[]): boolean {
  let moved = false
  for (const p of placed) {
    if (p.node.pos) {
      p.x = p.node.pos.x
      p.y = p.node.pos.y
      moved = true
    }
  }
  return moved
}

/** Parent→child connectors as orthogonal elbows routed from the final box
 *  geometry. Used by the tree layout once a box is manually moved (the bus
 *  routing assumes auto positions) and by the graph layouts (layered / matrix /
 *  swimlane), whose boxes are not in tidy-tree positions. Hidden containers
 *  draw no line, so their descendants connect to the nearest visible ancestor. */
function hierarchyConnectors(chart: OrgChart, placed: PlacedNode[]): string[] {
  const byId = indexById(placed)
  const parentOf = new Map<string, OrgNode | null>()
  visit(chart.roots, (n, parent) => parentOf.set(n.id, parent))
  const out: string[] = []
  visit(chart.roots, (n) => {
    if (n.variant === 'hidden') return
    let anc = parentOf.get(n.id) ?? null
    while (anc && anc.variant === 'hidden') anc = parentOf.get(anc.id) ?? null
    if (!anc) return
    const a = boxOf(byId, anc.id)
    const b = boxOf(byId, n.id)
    if (a && b) out.push(routeComm(a, b))
  })
  return out
}

/**
 * Cheap drag preview: move one box within an already-computed layout and
 * re-derive only the dependent geometry (connectors, zones, edges, bounds),
 * reusing every untouched PlacedNode object by reference. This skips the
 * per-move re-measure / re-layout and lets memoized boxes avoid re-rendering,
 * so dragging stays smooth on large charts.
 */
export function previewDrag(chart: OrgChart, base: Layout, id: string, x: number, y: number): Layout {
  const placed = base.placed.map((p) => (p.node.id === id ? { ...p, x, y } : p))
  // Free-form charts draw no hierarchy connectors — edges only.
  const conns = chart.meta.layout === 'free' ? [] : hierarchyConnectors(chart, placed)
  return assemble(chart, placed, conns)
}

/* ------------------------------------------------------------- radial */

/** Clearance (px) kept between adjacent radial boxes, radially and angularly. */
const RADIAL_GAP = 56

/** Number of leaves under a measured node (its angular weight). */
function leafCount(m: Measured): number {
  if (!m.children.length) return 1
  return m.children.reduce((s, c) => s + leafCount(c), 0)
}

interface RadialPlaced {
  m: Measured
  /** Center angle on its ring (radians). */
  angle: number
  cx: number
  cy: number
  depth: number
  parent: RadialPlaced | null
}

/** Assign each node a center angle: children partition the parent's arc by
 *  leaf weight, so every leaf ends up with an equal slice of the full circle.
 *  Radii (and hence cx/cy) are resolved afterward, once all angles are known. */
function placeRadial(
  m: Measured,
  a0: number,
  a1: number,
  depth: number,
  parent: RadialPlaced | null,
  out: RadialPlaced[],
): RadialPlaced {
  const self: RadialPlaced = { m, angle: (a0 + a1) / 2, cx: 0, cy: 0, depth, parent }
  out.push(self)
  const total = leafCount(m)
  let cursor = a0
  for (const c of m.children) {
    const span = ((a1 - a0) * leafCount(c)) / total
    placeRadial(c, cursor, cursor + span, depth + 1, self, out)
    cursor += span
  }
  return self
}

function layoutRadial(chart: OrgChart): Layout {
  const placed: PlacedNode[] = []
  const connectors: string[] = []
  const ox = M.canvasPad
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  let clusterLeft = 0

  // A box sits at an arbitrary angle on its ring but is never rotated, so its
  // half-diagonal is a rotation-safe bound on how far it reaches in any single
  // direction — used for both radial and tangential clearance.
  const halfDiag = (m: Measured) => Math.hypot(m.w, m.totalH) / 2

  for (const root of chart.roots) {
    const m = measureNode(root, true)

    const nodes: RadialPlaced[] = []
    placeRadial(m, 0, Math.PI * 2, 0, null, nodes)

    // Ring radii, sized from the ACTUAL geometry so no two boxes touch:
    //   • radial:  clear the previous ring's boxes and this ring's boxes.
    //   • angular: the tightest pair of adjacent centers on the ring must span
    //              both their footprints (radius * minAngleGap >= footprint).
    let maxDepth = 0
    const extentAt: number[] = []
    for (const n of nodes) {
      maxDepth = Math.max(maxDepth, n.depth)
      extentAt[n.depth] = Math.max(extentAt[n.depth] ?? 0, halfDiag(n.m))
    }
    const minGapAt: number[] = []
    for (let d = 0; d <= maxDepth; d++) {
      const angs = nodes.filter((n) => n.depth === d).map((n) => n.angle).sort((p, q) => p - q)
      if (angs.length < 2) {
        minGapAt[d] = Math.PI * 2
        continue
      }
      let g = Math.PI * 2 + angs[0] - angs[angs.length - 1] // wrap-around neighbor
      for (let i = 1; i < angs.length; i++) g = Math.min(g, angs[i] - angs[i - 1])
      minGapAt[d] = Math.max(g, 1e-3)
    }
    const radii: number[] = [0]
    for (let d = 1; d <= maxDepth; d++) {
      const radialMin = radii[d - 1] + extentAt[d - 1] + extentAt[d] + RADIAL_GAP
      const angularMin = (2 * extentAt[d] + RADIAL_GAP) / minGapAt[d]
      radii[d] = Math.max(radialMin, angularMin)
    }
    for (const n of nodes) {
      n.cx = radii[n.depth] * Math.cos(n.angle)
      n.cy = radii[n.depth] * Math.sin(n.angle)
    }

    // Shift this cluster so its bounding box sits at (clusterLeft, 0)+.
    const xs = nodes.map((n) => n.cx - n.m.w / 2)
    const ys = nodes.map((n) => n.cy - n.m.totalH / 2)
    const xe = nodes.map((n) => n.cx + n.m.w / 2)
    const minCx = Math.min(...xs)
    const minCy = Math.min(...ys)
    const shiftX = ox + clusterLeft - minCx
    const shiftY = oy - minCy

    // Final top-left of each node: its manual override wins over the auto ring
    // position. Center points are derived from that, so spokes follow moves.
    const topLeft = new Map<RadialPlaced, { x: number; y: number }>()
    for (const n of nodes) {
      topLeft.set(
        n,
        n.m.node.pos ?? { x: n.cx - n.m.w / 2 + shiftX, y: n.cy - n.m.totalH / 2 + shiftY },
      )
    }
    for (const n of nodes) {
      const tl = topLeft.get(n)!
      if (n.m.node.variant !== 'hidden') {
        placed.push({
          node: n.m.node,
          x: tl.x,
          y: tl.y,
          w: n.m.w,
          headerH: n.m.headerH,
          totalH: n.m.totalH,
          titleLines: n.m.titleLines,
          leftAlign: n.m.leftAlign,
          bulletLines: n.m.bulletLines,
          detailBlocks: n.m.detailBlocks,
        })
      }
      // Straight spoke from parent center to this node center (hidden under the
      // opaque boxes, so only the gap between them shows).
      if (n.parent && n.parent.m.node.variant !== 'hidden' && n.m.node.variant !== 'hidden') {
        const pt = topLeft.get(n.parent)!
        const pcx = pt.x + n.parent.m.w / 2
        const pcy = pt.y + n.parent.m.totalH / 2
        connectors.push(`M ${pcx} ${pcy} L ${tl.x + n.m.w / 2} ${tl.y + n.m.totalH / 2}`)
      }
    }

    const clusterW = Math.max(...xe) - minCx
    clusterLeft += clusterW + M.rootGap
  }

  return assemble(chart, placed, connectors)
}

/* ------------------------------ graph layouts (layered/matrix/swimlane) */

interface VisibleModel {
  /** Visible nodes in document (DFS) order. */
  nodes: OrgNode[]
  measured: Map<string, Measured>
  idset: Set<string>
  /** Nearest visible ancestor (hidden containers are bridged). */
  visParent: (n: OrgNode) => OrgNode | null
  /** Tree depth over visible nodes (roots = 0). */
  depth: (n: OrgNode) => number
}

/** Shared prep for the graph layouts: visible nodes + measurements, a
 *  nearest-visible-ancestor lookup, and memoized tree depth. */
function collectVisible(chart: OrgChart): VisibleModel {
  const parentOf = new Map<string, OrgNode | null>()
  visit(chart.roots, (n, p) => parentOf.set(n.id, p))
  const visParent = (n: OrgNode): OrgNode | null => {
    let a = parentOf.get(n.id) ?? null
    while (a && a.variant === 'hidden') a = parentOf.get(a.id) ?? null
    return a
  }
  const measured = new Map<string, Measured>()
  for (const r of chart.roots) {
    const stack: Measured[] = [measureNode(r, true)]
    while (stack.length) {
      const x = stack.pop()!
      measured.set(x.node.id, x)
      for (let i = x.children.length - 1; i >= 0; i--) stack.push(x.children[i])
    }
  }
  const nodes: OrgNode[] = []
  visit(chart.roots, (n) => {
    if (n.variant !== 'hidden') nodes.push(n)
  })
  const idset = new Set(nodes.map((n) => n.id))
  const depthCache = new Map<string, number>()
  const depth = (n: OrgNode): number => {
    const cached = depthCache.get(n.id)
    if (cached !== undefined) return cached
    const p = visParent(n)
    const d = p && idset.has(p.id) ? depth(p) + 1 : 0
    depthCache.set(n.id, d)
    return d
  }
  return { nodes, measured, idset, visParent, depth }
}

/** Build a PlacedNode from a measurement + auto position, honoring a manual
 *  override. Shared by every graph layout. */
function placeBox(n: OrgNode, m: Measured, x: number, y: number): PlacedNode {
  const at = n.pos ?? { x, y }
  return {
    node: n,
    x: at.x,
    y: at.y,
    w: m.w,
    headerH: m.headerH,
    totalH: m.totalH,
    titleLines: m.titleLines,
    leftAlign: m.leftAlign,
    bulletLines: m.bulletLines,
    detailBlocks: m.detailBlocks,
  }
}

/** Assign each visible node to a column. Columns come from the group zones
 *  (a group owns its members' subtrees, matching the zone rectangles), with a
 *  leading "unassigned" column for anything ungrouped. With no groups defined,
 *  each root's subtree becomes a column. */
function assignColumns(chart: OrgChart, model: VisibleModel): { label: string; ids: string[] }[] {
  const { nodes, idset } = model
  const nodeById = new Map<string, OrgNode>()
  visit(chart.roots, (n) => nodeById.set(n.id, n))
  const cols: { label: string; ids: string[] }[] = []

  if (chart.groups.length) {
    const sets = chart.groups.map((g) => {
      const s = new Set<string>()
      for (const mid of g.memberIds) {
        const n = nodeById.get(mid)
        if (n) for (const i of subtreeIds(n)) if (idset.has(i)) s.add(i)
      }
      return s
    })
    const buckets = chart.groups.map(() => [] as string[])
    const ungrouped: string[] = []
    for (const n of nodes) {
      const gi = sets.findIndex((s) => s.has(n.id))
      if (gi >= 0) buckets[gi].push(n.id)
      else ungrouped.push(n.id)
    }
    if (ungrouped.length) cols.push({ label: '', ids: ungrouped })
    chart.groups.forEach((g, i) => {
      if (buckets[i].length) cols.push({ label: g.label ?? '', ids: buckets[i] })
    })
  } else {
    for (const r of chart.roots) {
      const s = new Set(subtreeIds(r))
      const ids = nodes.filter((n) => s.has(n.id)).map((n) => n.id)
      if (ids.length) cols.push({ label: r.title, ids })
    }
  }
  return cols
}

const LAYERED_SWEEPS = 6

/** Sugiyama-lite layered layout. Every node is ranked into a depth-aligned row;
 *  barycenter passes center parents over their children (and pull cross-linked
 *  nodes together), so global peers line up and dotted-line relationships read
 *  clearly. Comms are drawn as the cross-layer edges by assemble(). */
function layoutLayered(chart: OrgChart): Layout {
  const model = collectVisible(chart)
  const { nodes, measured, idset, depth, visParent } = model
  if (!nodes.length) return assemble(chart, [], [])

  // Undirected adjacency for barycenter: hierarchy edges + comm cross-links.
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  const link = (a: string, b: string) => {
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  for (const n of nodes) {
    const p = visParent(n)
    if (p && idset.has(p.id)) link(p.id, n.id)
  }
  for (const c of chart.comms) {
    if (idset.has(c.fromId) && idset.has(c.toId) && c.fromId !== c.toId) link(c.fromId, c.toId)
  }

  // Rows by depth, initial order = DFS order.
  const maxLayer = Math.max(...nodes.map((n) => depth(n)))
  const rows: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const n of nodes) rows[depth(n)].push(n.id)

  // Row Y offsets (each row is as tall as its tallest box).
  const ox = M.canvasPad
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const rowY: number[] = []
  let yCursor = 0
  for (let L = 0; L <= maxLayer; L++) {
    rowY[L] = yCursor
    yCursor += Math.max(0, ...rows[L].map((id) => measured.get(id)!.totalH)) + M.levelGap
  }

  // Center-x per node: pack each row, then barycenter passes align the layers.
  const cx = new Map<string, number>()
  for (const row of rows) {
    let x = 0
    for (const id of row) {
      const w = measured.get(id)!.w
      cx.set(id, x + w / 2)
      x += w + M.siblingGap
    }
  }
  const resolveRow = (row: string[]) => {
    // Left-to-right, then right-to-left, so a barycenter target keeps min gaps
    // without dragging the whole row one way.
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1]
      const b = row[i]
      const min = cx.get(a)! + measured.get(a)!.w / 2 + M.siblingGap + measured.get(b)!.w / 2
      if (cx.get(b)! < min) cx.set(b, min)
    }
    for (let i = row.length - 2; i >= 0; i--) {
      const a = row[i]
      const b = row[i + 1]
      const max = cx.get(b)! - measured.get(b)!.w / 2 - M.siblingGap - measured.get(a)!.w / 2
      if (cx.get(a)! > max) cx.set(a, max)
    }
  }
  for (let sweep = 0; sweep < LAYERED_SWEEPS; sweep++) {
    for (const row of rows) {
      for (const id of row) {
        const ns = adj.get(id)!
        if (ns.length) cx.set(id, ns.reduce((s, k) => s + cx.get(k)!, 0) / ns.length)
      }
      resolveRow(row)
    }
  }

  // Shift so the leftmost box edge sits at ox.
  let minX = Infinity
  for (const n of nodes) minX = Math.min(minX, cx.get(n.id)! - measured.get(n.id)!.w / 2)
  const shiftX = ox - minX

  const placed = nodes.map((n) =>
    placeBox(n, measured.get(n.id)!, cx.get(n.id)! - measured.get(n.id)!.w / 2 + shiftX, rowY[depth(n)] + oy),
  )
  return assemble(chart, placed, hierarchyConnectors(chart, placed))
}

const CELL_GAP = 16
const COLUMN_GAP = 56

/** Matrix layout: a 2D grid with rows = tree depth and columns = group (or, if
 *  no groups are defined, root subtree). Cells stack their nodes vertically, so
 *  columns stay one box wide and depth reads across the grid. */
function layoutMatrix(chart: OrgChart): Layout {
  const model = collectVisible(chart)
  const { nodes, measured, depth } = model
  if (!nodes.length) return assemble(chart, [], [])
  const cols = assignColumns(chart, model)
  const colOf = new Map<string, number>()
  cols.forEach((c, ci) => c.ids.forEach((id) => colOf.set(id, ci)))
  const maxRow = Math.max(...nodes.map((n) => depth(n)))

  // Bucket nodes into cells (col, row), preserving DFS order.
  const cell = (ci: number, r: number) => ci * (maxRow + 1) + r
  const cells = new Map<number, string[]>()
  for (const n of nodes) {
    const k = cell(colOf.get(n.id)!, depth(n))
    ;(cells.get(k) ?? cells.set(k, []).get(k)!).push(n.id)
  }
  const cellHeight = (ids: string[] | undefined) =>
    ids && ids.length
      ? ids.reduce((s, id) => s + measured.get(id)!.totalH, 0) + CELL_GAP * (ids.length - 1)
      : 0

  // Column widths (widest box in the column) and row heights (tallest cell).
  const colW = cols.map((c) => Math.max(0, ...c.ids.map((id) => measured.get(id)!.w)))
  const rowH: number[] = []
  for (let r = 0; r <= maxRow; r++) {
    rowH[r] = Math.max(0, ...cols.map((_, ci) => cellHeight(cells.get(cell(ci, r)))))
  }

  const ox = M.canvasPad
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const colX: number[] = []
  let xCursor = ox
  for (let ci = 0; ci < cols.length; ci++) {
    colX[ci] = xCursor
    xCursor += colW[ci] + COLUMN_GAP
  }
  const rowYs: number[] = []
  let yCursor = oy
  for (let r = 0; r <= maxRow; r++) {
    rowYs[r] = yCursor
    yCursor += rowH[r] + M.levelGap
  }

  const placed: PlacedNode[] = []
  for (let ci = 0; ci < cols.length; ci++) {
    for (let r = 0; r <= maxRow; r++) {
      const ids = cells.get(cell(ci, r))
      if (!ids) continue
      let y = rowYs[r]
      for (const id of ids) {
        const m = measured.get(id)!
        const x = colX[ci] + (colW[ci] - m.w) / 2
        placed.push(placeBox(m.node, m, x, y))
        y += m.totalH + CELL_GAP
      }
    }
  }
  return assemble(chart, placed, hierarchyConnectors(chart, placed))
}

/** Swimlane layout: one vertical lane per group (or root subtree). Each lane is
 *  an independent top-to-bottom list of its nodes (DFS order); lanes sit side by
 *  side. The group zones render behind as the labeled lane bands. */
function layoutSwimlane(chart: OrgChart): Layout {
  const model = collectVisible(chart)
  const { nodes, measured } = model
  if (!nodes.length) return assemble(chart, [], [])
  const cols = assignColumns(chart, model)

  const ox = M.canvasPad
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const laneW = cols.map((c) => Math.max(0, ...c.ids.map((id) => measured.get(id)!.w)))

  const placed: PlacedNode[] = []
  let xCursor = ox
  for (let ci = 0; ci < cols.length; ci++) {
    let y = oy
    for (const id of cols[ci].ids) {
      const m = measured.get(id)!
      const x = xCursor + (laneW[ci] - m.w) / 2
      placed.push(placeBox(m.node, m, x, y))
      y += m.totalH + CELL_GAP
    }
    xCursor += laneW[ci] + COLUMN_GAP
  }
  return assemble(chart, placed, hierarchyConnectors(chart, placed))
}

/**
 * Return a copy of the chart with WBS outline numbers prepended to every
 * visible box's title (1, 1.1, 1.1.1 ...). Hidden containers are transparent:
 * their visible children join the parent level's sequence. Purely a view
 * transform — the stored chart (and the editor) keep clean titles.
 */
export function withWbsNumbers(chart: OrgChart): OrgChart {
  const next = clone(chart)
  const nums = wbsNumbers(next.roots)
  visit(next.roots, (n) => {
    const num = nums.get(n.id)
    if (num) n.title = n.title ? `${num}  ${n.title}` : num
  })
  return next
}

/* --------------------------------------------------------- timeline (Gantt) */

const TL_ROW_H = 30
const TL_ROW_GAP = 6
const TL_PLOT_W = 760
const TL_AXIS_H = 34 // headroom above the first row for axis labels
const TL_GAP = 12 // gap between axis and the first row

/**
 * Transition / phase-in schedule. Visible nodes (DFS order) become task rows;
 * each carries `start` and `duration` in schedule units, or renders as a
 * milestone diamond. Deterministic geometry over a linear time axis, with phase
 * markers (default 30/60/90 for day units) and quarter-span ticks.
 */
function layoutTimeline(chart: OrgChart): Layout {
  const tasks: { node: OrgNode; depth: number }[] = []
  visit(chart.roots, (n, _p, depth) => {
    if (n.variant !== 'hidden') tasks.push({ node: n, depth })
  })

  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const startOf = (n: OrgNode) => Math.max(0, num(n.start))
  const durOf = (n: OrgNode) => (n.milestone ? 0 : Math.max(0, num(n.duration)))
  const endOf = (n: OrgNode) => startOf(n) + durOf(n)

  const maxEnd = tasks.reduce((m, t) => Math.max(m, endOf(t.node)), 0)
  const unit = chart.schedule?.unit ?? 'day'
  const span = Math.max(1, chart.schedule?.span ?? maxEnd)

  const labelW = (t: { node: OrgNode; depth: number }) =>
    textWidth(t.node.title, 12) + t.depth * 12
  const gutter = Math.min(360, Math.max(150, Math.max(0, ...tasks.map(labelW)) + 24))

  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const axisY = oy + TL_AXIS_H
  const plotX = M.canvasPad + gutter
  const plotW = TL_PLOT_W
  const perUnit = plotW / span
  const at = (u: number) => plotX + u * perUnit
  const top = axisY + TL_GAP

  const bars: TimelineBar[] = tasks.map((t, i) => {
    const v = t.node.color
      ? { fill: t.node.color, text: readableText(t.node.color) }
      : (variantFill[t.node.variant] ?? variantFill.secondary)
    return {
      node: t.node,
      label: t.node.title,
      depth: t.depth,
      y: top + i * (TL_ROW_H + TL_ROW_GAP),
      rowH: TL_ROW_H,
      milestone: !!t.node.milestone,
      barX: at(startOf(t.node)),
      barW: Math.max(0, durOf(t.node) * perUnit),
      fill: v.fill,
      text: v.text,
    }
  })

  let phaseSrc = chart.schedule?.phases
  if (!phaseSrc && unit === 'day') {
    phaseSrc = [30, 60, 90].filter((d) => d <= span).map((d) => ({ label: `${d}-day`, at: d }))
  }
  const phases = (phaseSrc ?? [])
    .filter((p) => p.at >= 0 && p.at <= span)
    .map((p) => ({ label: p.label, x: at(p.at) }))

  // Workstream swimlane bands from group membership (a group owns its members'
  // subtrees), spanning the y-range of its rows.
  const bands: TimelineBand[] = []
  if (chart.groups.length) {
    const nodeById = new Map<string, OrgNode>()
    visit(chart.roots, (n) => nodeById.set(n.id, n))
    const barById = new Map(bars.map((b) => [b.node.id, b]))
    for (const g of chart.groups) {
      const ids = new Set<string>()
      for (const mid of g.memberIds) {
        const mn = nodeById.get(mid)
        if (mn) subtreeIds(mn).forEach((i) => ids.add(i))
      }
      let y1 = Infinity
      let y2 = -Infinity
      for (const id of ids) {
        const b = barById.get(id)
        if (b) {
          y1 = Math.min(y1, b.y)
          y2 = Math.max(y2, b.y + b.rowH)
        }
      }
      if (y1 === Infinity) continue
      bands.push({ label: g.label ?? '', y: y1 - 4, h: y2 - y1 + 8, style: g.style })
    }
  }

  const abbr = unit === 'day' ? 'D' : unit === 'week' ? 'W' : 'M'
  const tickUnits = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(span * f)))]
  const ticks = tickUnits.map((u) => ({ x: at(u), label: `${abbr}${u}` }))

  const bottom = bars.length ? bars[bars.length - 1].y + TL_ROW_H : top + TL_ROW_H
  const timeline: TimelineLayout = {
    gutter,
    plotX,
    plotW,
    axisY,
    top,
    rowH: TL_ROW_H,
    rowGap: TL_ROW_GAP,
    bars,
    bands,
    ticks,
    phases,
    unit,
    span,
  }
  return finishDataLayout(chart, plotX + plotW, bottom, { timeline })
}

/* ------------------------------------------------------------------ table */

const TBL_PAD_X = 10
const TBL_PAD_Y = 7
const TBL_HEADER_SIZE = 12
const TBL_CELL_SIZE = 11
const TBL_LINE_H = 15
const TBL_MIN_COL = 70
const TBL_MAX_COL = 340
const TBL_ROW_MIN = 26

/** Branded data table (RACI, compliance crosswalk, QASP/SLA, comparison, ...).
 *  Columns size to content unless a fixed width is given; rows grow to fit
 *  wrapped text. A `header` row spans all columns as a section band. */
function layoutTable(chart: OrgChart): Layout {
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const ox = M.canvasPad

  const table = chart.table
  if (!table || !table.columns.length) return finishDataLayout(chart, ox + 200, oy + 40, {})

  const cols = table.columns
  const colW = cols.map((c, ci) => {
    if (c.width) return c.width
    let w = textWidth(c.label, TBL_HEADER_SIZE, true)
    for (const r of table.rows) {
      if (r.header) continue
      const cell = r.cells[ci]
      if (cell) w = Math.max(w, textWidth(cell.text, TBL_CELL_SIZE))
    }
    return Math.max(TBL_MIN_COL, Math.min(TBL_MAX_COL, Math.ceil(w) + TBL_PAD_X * 2))
  })
  const colX: number[] = []
  let cx = ox
  for (let i = 0; i < cols.length; i++) {
    colX[i] = cx
    cx += colW[i]
  }
  const totalW = cx - ox

  const headerLinesByCol = cols.map((c, i) => wrapText(c.label, TBL_HEADER_SIZE, colW[i] - TBL_PAD_X * 2, true))
  const headerH = Math.max(TBL_ROW_MIN, Math.max(...headerLinesByCol.map((l) => l.length)) * TBL_LINE_H + TBL_PAD_Y * 2)

  const columns: TableColLayout[] = cols.map((c, i) => ({
    label: c.label,
    headerLines: headerLinesByCol[i],
    x: colX[i],
    w: colW[i],
    align: c.align ?? (i === 0 ? 'left' : 'center'),
  }))

  let ry = oy + headerH
  const rows: TableRowLayout[] = table.rows.map((r) => {
    if (r.header) {
      const label = r.cells[0]?.text ?? ''
      const lines = wrapText(label, TBL_CELL_SIZE, totalW - TBL_PAD_X * 2, true)
      const h = Math.max(22, lines.length * TBL_LINE_H + TBL_PAD_Y * 2)
      const row: TableRowLayout = { y: ry, h, header: true, cells: [{ lines, align: 'left' }] }
      ry += h
      return row
    }
    const cellLines = cols.map((_c, i) => wrapText(r.cells[i]?.text ?? '', TBL_CELL_SIZE, colW[i] - TBL_PAD_X * 2))
    const h = Math.max(TBL_ROW_MIN, Math.max(...cellLines.map((l) => l.length)) * TBL_LINE_H + TBL_PAD_Y * 2)
    const cells: TableCellLayout[] = cols.map((c, i) => ({
      lines: cellLines[i],
      status: r.cells[i]?.status,
      align: c.align ?? (i === 0 ? 'left' : 'center'),
    }))
    const row: TableRowLayout = { y: ry, h, header: false, cells }
    ry += h
    return row
  })
  const tableBottom = ry

  const tableLayout: TableLayout = {
    x: ox,
    y: oy,
    headerH,
    zebra: table.zebra !== false,
    totalW,
    columns,
    rows,
  }
  return finishDataLayout(chart, ox + totalW, tableBottom, { table: tableLayout })
}

/* ------------------------------------------------------------- risk cube */

const RC_CELL = 72 // cell size (px)
const RC_AXIS = 46 // gutter for axis numbers + rotated axis title
const RC_PANEL_GAP = 26
const RC_ROW_H = 21
const RC_PANEL_MAX_W = 380

/** Resolve a risk's marker code: its own, or an auto number by register order. */
function riskCode(r: RiskItem, i: number): string {
  return r.code?.trim() || `R${i + 1}`
}

/**
 * 5×5 risk cube. Likelihood runs 1 (bottom) to 5 (top), consequence 1 (left)
 * to 5 (right); cells are tinted by the standard risk matrix. Each risk drops
 * a marker at its (L, C) cell; a residual position adds an open marker and a
 * mitigation arrow. Markers sharing a cell spread over a deterministic
 * mini-grid so they never overlap. A register panel lists every risk.
 */
function layoutRisk(chart: OrgChart): Layout {
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const x0 = M.canvasPad + RC_AXIS
  const y0 = oy + 8
  const plotW = RC_CELL * 5
  const plotH = RC_CELL * 5

  const cells: RiskCubeLayout['cells'] = []
  for (let L = 1; L <= 5; L++) {
    for (let C = 1; C <= 5; C++) {
      cells.push({
        row: L,
        col: C,
        x: x0 + (C - 1) * RC_CELL,
        y: y0 + (5 - L) * RC_CELL, // likelihood 5 at the top
        level: riskLevel(L, C),
      })
    }
  }

  const risks = chart.risk?.risks ?? []

  // Deterministic anti-overlap: bucket every point (current + residual) into
  // its cell, then spread each cell's points over a centered √n × √n grid.
  type Point = { riskIdx: number; residual: boolean; L: number; C: number }
  const points: Point[] = []
  risks.forEach((r, i) => {
    points.push({ riskIdx: i, residual: false, L: r.likelihood, C: r.consequence })
    if (r.residual) points.push({ riskIdx: i, residual: true, L: r.residual.likelihood, C: r.residual.consequence })
  })
  const byCell = new Map<string, Point[]>()
  for (const p of points) {
    const key = `${p.L}:${p.C}`
    ;(byCell.get(key) ?? byCell.set(key, []).get(key)!).push(p)
  }
  const posOf = new Map<Point, { cx: number; cy: number }>()
  for (const bucket of byCell.values()) {
    const g = Math.ceil(Math.sqrt(bucket.length))
    bucket.forEach((p, k) => {
      const col = k % g
      const row = Math.floor(k / g)
      // Rows used may be fewer than g; center the occupied block vertically.
      const rowsUsed = Math.ceil(bucket.length / g)
      const cellX = x0 + (p.C - 1) * RC_CELL
      const cellY = y0 + (5 - p.L) * RC_CELL
      posOf.set(p, {
        cx: cellX + ((col + 1) * RC_CELL) / (g + 1),
        cy: cellY + ((row + 1) * RC_CELL) / (rowsUsed + 1),
      })
    })
  }

  const markers: RiskMarkerLayout[] = risks.map((r, i) => {
    const cur = points.find((p) => p.riskIdx === i && !p.residual)!
    const curPos = posOf.get(cur)!
    const m: RiskMarkerLayout = {
      id: r.id,
      code: riskCode(r, i),
      title: r.title,
      cx: curPos.cx,
      cy: curPos.cy,
      level: riskLevel(r.likelihood, r.consequence),
    }
    if (r.residual) {
      const res = points.find((p) => p.riskIdx === i && p.residual)!
      const resPos = posOf.get(res)!
      m.residual = { cx: resPos.cx, cy: resPos.cy, level: riskLevel(r.residual.likelihood, r.residual.consequence) }
    }
    return m
  })

  // Register panel to the right of the cube: code, title, and the move.
  let panel: RiskCubeLayout['panel'] = null
  if (risks.length) {
    const moveOf = (r: RiskItem) =>
      `L${r.likelihood}·C${r.consequence}${r.residual ? ` → L${r.residual.likelihood}·C${r.residual.consequence}` : ''}`
    const rows: RiskListRow[] = risks.map((r, i) => ({
      id: r.id,
      code: riskCode(r, i),
      title: r.title,
      move: moveOf(r),
      level: riskLevel(r.likelihood, r.consequence),
      y: 0, // filled below once the panel origin is known
    }))
    const widest = Math.max(
      textWidth('Risk Register', 12, true),
      ...risks.map(
        (r, i) => textWidth(`${riskCode(r, i)}  ${r.title}`, 11) + textWidth(moveOf(r), 10.5) + 40,
      ),
    )
    const w = Math.min(RC_PANEL_MAX_W, Math.max(220, widest + 24))
    const h = 12 * 2 + 18 + rows.length * RC_ROW_H
    const px = x0 + plotW + RC_PANEL_GAP
    rows.forEach((row, i) => {
      row.y = y0 + 12 + 18 + i * RC_ROW_H + 14
    })
    panel = { x: px, y: y0, w, h, rows }
  }

  const risk: RiskCubeLayout = {
    x: x0,
    y: y0,
    cellSize: RC_CELL,
    cells,
    markers,
    xLabel: chart.risk?.xLabel ?? 'Consequence',
    yLabel: chart.risk?.yLabel ?? 'Likelihood',
    plotW,
    plotH,
    panel,
  }
  const right = panel ? panel.x + panel.w : x0 + plotW
  const bottom = Math.max(y0 + plotH + RC_AXIS, panel ? panel.y + panel.h : 0)
  return finishDataLayout(chart, right, bottom, { risk })
}

/* -------------------------------------------------------------- xy chart */

const XY_PLOT_W = 640
const XY_PLOT_H = 320
const XY_LEGEND_H = 20
/** Fraction of an x-slot occupied by a bar group. */
const XY_BAR_FILL = 0.62
/** Default series colors rotate through the semantic variants. */
const XY_SERIES_VARIANTS = ['primary', 'secondary', 'accent', 'tertiary'] as const

/** A "nice" step (1/2/5 × 10ⁿ) so ~count ticks span the range. */
function niceStep(span: number, count: number): number {
  const step0 = Math.pow(10, Math.floor(Math.log10(span / count)))
  const err = span / count / step0
  return step0 * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1)
}

/**
 * Round tick values covering [min, max]. With `expand` the range is widened to
 * step multiples (axis domains snap to the grid); without it, ticks fall
 * strictly inside the data range. Exported for tests.
 */
export function niceTicks(min: number, max: number, count = 5, expand = false): number[] {
  if (!(max > min)) max = min + 1
  const step = niceStep(max - min, count)
  const start = expand ? Math.floor(min / step) * step : Math.ceil(min / step) * step
  const end = expand ? Math.ceil(max / step) * step : max
  const ticks: number[] = []
  for (let v = start; v <= end + step * 1e-6; v += step) ticks.push(+v.toFixed(10))
  return ticks
}

/** Compact tick label (grouping separators, float noise trimmed). */
function tickLabel(v: number): string {
  if (Math.abs(v) >= 1000 && Number.isInteger(v)) return v.toLocaleString('en-US')
  return String(+v.toFixed(6))
}

/**
 * X-Y chart layout: line, area and bar series over shared numeric axes.
 * The y domain always includes zero (ramps, burndowns and ROI charts read
 * from a common baseline); bars group side-by-side inside an x slot sized
 * from the closest pair of x values.
 */
function layoutXY(chart: OrgChart): Layout {
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const xy = chart.xy
  const series = xy?.series ?? []
  const all = series.flatMap((s) => s.points)

  // Data extents (safe defaults for an empty chart).
  let xMin = all.length ? Math.min(...all.map((p) => p.x)) : 0
  let xMax = all.length ? Math.max(...all.map((p) => p.x)) : 10
  const dataYMin = all.length ? Math.min(...all.map((p) => p.y)) : 0
  const dataYMax = all.length ? Math.max(...all.map((p) => p.y)) : 5

  // Bars occupy an x slot; widen the domain half a slot each side so the
  // first and last groups sit fully inside the plot.
  const barSeries = series.filter((s) => s.kind === 'bar' && s.points.length)
  let slot = 1
  if (barSeries.length) {
    const xs = [...new Set(barSeries.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b)
    if (xs.length > 1) {
      slot = Infinity
      for (let i = 1; i < xs.length; i++) slot = Math.min(slot, xs[i] - xs[i - 1])
    }
    xMin -= slot / 2
    xMax += slot / 2
  }
  if (xMax === xMin) {
    xMin -= 0.5
    xMax += 0.5
  }

  // Y domain: include zero, snap to the tick grid.
  const yTickVals = niceTicks(Math.min(0, dataYMin), Math.max(0, dataYMax), 5, true)
  const yMin = yTickVals[0]
  const yMax = yTickVals[yTickVals.length - 1]

  // Gutters sized from the actual tick labels.
  const yLabels = yTickVals.map(tickLabel)
  const gutterL = Math.max(...yLabels.map((l) => textWidth(l, 10.5))) + 14 + (xy?.yLabel ? 20 : 0)
  const x0 = M.canvasPad + gutterL
  const legendItems = series.filter((s) => s.label.trim())
  const y0 = oy + (legendItems.length ? XY_LEGEND_H + 8 : 0) + 6
  const plotW = XY_PLOT_W
  const plotH = XY_PLOT_H

  const sx = (v: number) => x0 + ((v - xMin) / (xMax - xMin)) * plotW
  const sy = (v: number) => y0 + plotH - ((v - yMin) / (yMax - yMin)) * plotH
  const zeroY = sy(Math.min(Math.max(0, yMin), yMax))

  const xTicks = niceTicks(xMin, xMax, 6).map((v) => ({ x: sx(v), label: tickLabel(v) }))
  const yTicks = yTickVals.map((v) => ({ y: sy(v), label: tickLabel(v) }))

  let barIndex = 0
  const nBars = barSeries.length
  const groupW = ((slot * XY_BAR_FILL) / (xMax - xMin)) * plotW
  const seriesLayouts: XYSeriesLayout[] = series.map((s, i) => {
    const variant = s.variant ?? XY_SERIES_VARIANTS[i % XY_SERIES_VARIANTS.length]
    const fill = (variantFill[variant] ?? variantFill.secondary).fill
    const dots = s.points.map((p) => ({ x: sx(p.x), y: sy(p.y) }))
    const out: XYSeriesLayout = { id: s.id, label: s.label, kind: s.kind, fill, dots }
    if (s.kind === 'bar') {
      const w = nBars ? groupW / nBars : groupW
      const offset = -groupW / 2 + barIndex * w
      barIndex += 1
      out.bars = s.points.map((p) => {
        const px = sx(p.x) + offset
        const py = sy(p.y)
        return {
          x: px,
          y: Math.min(py, zeroY),
          w,
          h: Math.abs(zeroY - py),
        }
      })
    } else if (dots.length) {
      out.linePath = dots.map((d, k) => `${k === 0 ? 'M' : 'L'} ${d.x} ${d.y}`).join(' ')
      if (s.kind === 'area') {
        out.areaPath = `${out.linePath} L ${dots[dots.length - 1].x} ${zeroY} L ${dots[0].x} ${zeroY} Z`
      }
    }
    return out
  })

  // Horizontal legend above the plot, one entry per labeled series.
  let lx = x0
  const legend: XYLegendItem[] = legendItems.map((s) => {
    const li = seriesLayouts.find((sl) => sl.id === s.id)!
    const item: XYLegendItem = { id: s.id, label: s.label, fill: li.fill, kind: s.kind, x: lx, y: oy + 6 }
    lx += 22 + textWidth(s.label, 11) + 18
    return item
  })

  const xyLayout: XYLayout = {
    x: x0,
    y: y0,
    plotW,
    plotH,
    xLabel: xy?.xLabel ?? null,
    yLabel: xy?.yLabel ?? null,
    xTicks,
    yTicks,
    zeroY,
    series: seriesLayouts,
    legend,
  }
  const bottom = y0 + plotH + 22 + (xy?.xLabel ? 20 : 0)
  const right = Math.max(x0 + plotW, lx)
  return finishDataLayout(chart, right, bottom, { xy: xyLayout })
}

/* --------------------------------------------------------- free-form */

const FREE_GRID_COLS = 4
const FREE_GRID_GAP_X = 60
const FREE_GRID_GAP_Y = 56

/**
 * Free-form diagramming (system architecture, network topology, data flow):
 * every visible box sits at its manual position; boxes without one are dealt
 * onto a deterministic grid so they never stack. The tree structure is purely
 * organizational here — no hierarchy connectors are drawn; every connection
 * is an explicit labeled edge, routed by assemble() like any other.
 */
function layoutFree(chart: OrgChart): Layout {
  const model = collectVisible(chart)
  const { nodes, measured } = model
  if (!nodes.length) return assemble(chart, [], [])

  const ox = M.canvasPad
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)

  // Deal unpositioned boxes onto a grid sized from the largest box, below the
  // lowest manually-placed content so new boxes appear in clear space.
  const placedBottom = nodes.reduce(
    (b, n) => (n.pos ? Math.max(b, n.pos.y + measured.get(n.id)!.totalH) : b),
    0,
  )
  const cellW = Math.max(...nodes.map((n) => measured.get(n.id)!.w)) + FREE_GRID_GAP_X
  const cellH =
    Math.max(...nodes.map((n) => measured.get(n.id)!.totalH)) + FREE_GRID_GAP_Y
  let slot = 0
  const placed: PlacedNode[] = nodes.map((n) => {
    const m = measured.get(n.id)!
    if (n.pos) return placeBox(n, m, n.pos.x, n.pos.y)
    const col = slot % FREE_GRID_COLS
    const row = Math.floor(slot / FREE_GRID_COLS)
    slot += 1
    return placeBox(n, m, ox + col * cellW, (placedBottom ? placedBottom + FREE_GRID_GAP_Y : oy) + row * cellH)
  })
  return assemble(chart, placed, [])
}

/* ---------------------------------------- flow (cycle / pipeline / stack) */

const FLOW_VARIANT_ROTATION = ['primary', 'secondary', 'tertiary', 'accent'] as const

/** Fill + readable text for a flow step, rotating variants when unset. */
function flowFill(step: FlowStep, i: number): { fill: string; text: string } {
  const variant = step.variant ?? FLOW_VARIANT_ROTATION[i % FLOW_VARIANT_ROTATION.length]
  return variantFill[variant] ?? variantFill.secondary
}

/* Cycle metrics. */
const CY_R = 158 // outer radius
const CY_r = 96 // inner radius
const CY_GAP_DEG = 3 // angular gap between segments
const CY_TIP_DEG = 7 // arrowhead sweep at each segment's leading edge
const CY_DETAIL_W = 170

/** Point on a circle, angle in degrees clockwise from 12 o'clock. */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

const pt = ([x, y]: [number, number]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`

/**
 * Cycle layout (PDCA, continuous improvement): steps become interlocking
 * annular arrow segments running clockwise from 12 o'clock, with titles
 * inside the ring, details just outside it, and an optional hub label.
 */
function layoutCycle(chart: OrgChart): Layout {
  const steps = chart.flow?.steps ?? []
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const anyDetail = steps.some((s) => s.detail)
  const padSide = anyDetail ? CY_DETAIL_W + 26 : 26
  const padTop = anyDetail ? 56 : 20
  const cx = M.canvasPad + padSide + CY_R
  const cyc = oy + padTop + CY_R
  const midR = (CY_R + CY_r) / 2

  const n = Math.max(1, steps.length)
  const seg = 360 / n
  const stepLayouts: FlowStepLayout[] = steps.map((s, i) => {
    const a0 = i * seg + CY_GAP_DEG / 2
    const a1 = (i + 1) * seg - CY_GAP_DEG / 2
    const largeArc = a1 - a0 > 180 ? 1 : 0
    // Leading edge (a1) carries the arrow tip; the trailing edge (a0) carries
    // the matching notch, so consecutive segments interlock like chevrons.
    const path = [
      `M ${pt(polar(cx, cyc, CY_R, a0))}`,
      `A ${CY_R} ${CY_R} 0 ${largeArc} 1 ${pt(polar(cx, cyc, CY_R, a1))}`,
      `L ${pt(polar(cx, cyc, midR, a1 + CY_TIP_DEG))}`,
      `L ${pt(polar(cx, cyc, CY_r, a1))}`,
      `A ${CY_r} ${CY_r} 0 ${largeArc} 0 ${pt(polar(cx, cyc, CY_r, a0))}`,
      `L ${pt(polar(cx, cyc, midR, a0 + CY_TIP_DEG))}`,
      'Z',
    ].join(' ')
    const mid = (a0 + a1) / 2 + CY_TIP_DEG / 2
    const [labelX, labelY] = polar(cx, cyc, midR, mid)
    const { fill, text } = flowFill(s, i)
    const titleLines = wrapText(s.title, 12.5, CY_R - CY_r - 14, true).slice(0, 2)

    let detail: FlowStepLayout['detail'] = null
    if (s.detail) {
      const lines = wrapText(s.detail, 10.5, CY_DETAIL_W)
      const [dx, dy] = polar(cx, cyc, CY_R + 16, mid)
      const rad = ((mid - 90) * Math.PI) / 180
      const cos = Math.cos(rad)
      const anchor = cos > 0.35 ? 'start' : cos < -0.35 ? 'end' : 'middle'
      // Blocks above the ring grow upward so they never overlap it.
      const above = Math.sin(rad) < -0.35
      const y = above ? dy - (lines.length - 1) * 14 - 4 : dy + 8
      detail = { lines, x: dx, y, anchor }
    }
    return { id: s.id, path, fill, text, titleLines, labelX, labelY, detail }
  })

  const hubText = chart.flow?.hub
  const hub = hubText
    ? { lines: wrapText(hubText, 13, CY_r * 2 - 40, true).slice(0, 3), x: cx, y: cyc }
    : null

  const flow: FlowLayout = { kind: 'cycle', steps: stepLayouts, hub }
  return finishDataLayout(chart, cx + CY_R + padSide, cyc + CY_R + padTop, { flow })
}

/* Pipeline metrics. */
const PL_H = 64
const PL_TIP = 18
const PL_GAP = 4
const PL_MIN_W = 118
const PL_MAX_W = 230

/**
 * Pipeline layout (DevSecOps, lifecycle phases): steps become left-to-right
 * chevrons whose tips nest into the next stage's notch; details render under
 * each stage.
 */
function layoutPipeline(chart: OrgChart): Layout {
  const steps = chart.flow?.steps ?? []
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const y = oy + 12

  let x = M.canvasPad
  let bottom = y + PL_H
  const stepLayouts: FlowStepLayout[] = steps.map((s, i) => {
    const titleLines = wrapText(s.title, 13, PL_MAX_W - 46, true).slice(0, 2)
    const w = Math.max(
      PL_MIN_W,
      Math.min(PL_MAX_W, Math.max(...titleLines.map((l) => textWidth(l, 13, true))) + 46),
    )
    const first = i === 0
    // Flat left edge on the first stage; a notch everywhere else.
    const path = [
      `M ${x} ${y}`,
      `L ${x + w} ${y}`,
      `L ${x + w + PL_TIP} ${y + PL_H / 2}`,
      `L ${x + w} ${y + PL_H}`,
      `L ${x} ${y + PL_H}`,
      ...(first ? [] : [`L ${x + PL_TIP} ${y + PL_H / 2}`]),
      'Z',
    ].join(' ')
    const { fill, text } = flowFill(s, i)
    // Center the label over the body, nudged right past the notch.
    const labelX = x + (first ? 0 : PL_TIP / 2) + w / 2 + PL_TIP / 4

    let detail: FlowStepLayout['detail'] = null
    if (s.detail) {
      const lines = wrapText(s.detail, 10.5, w + PL_TIP - 6)
      detail = { lines, x: labelX, y: y + PL_H + 16, anchor: 'middle' }
      bottom = Math.max(bottom, y + PL_H + 6 + lines.length * 14)
    }
    const out: FlowStepLayout = { id: s.id, path, fill, text, titleLines, labelX, labelY: y + PL_H / 2, detail }
    x += w + PL_GAP
    return out
  })

  const flow: FlowLayout = { kind: 'pipeline', steps: stepLayouts, hub: null }
  return finishDataLayout(chart, x + PL_TIP, bottom, { flow })
}

/* Stack metrics. */
const SK_MIN_W = 360
const SK_MAX_W = 640
const SK_GAP = 8
const SK_PAD_Y = 12

/**
 * Stack layout (technology layers): steps become full-width rounded layers,
 * first step on top, with the layer's contents on a muted line beneath its
 * title.
 */
function layoutStack(chart: OrgChart): Layout {
  const steps = chart.flow?.steps ?? []
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const x = M.canvasPad

  const w = Math.max(
    SK_MIN_W,
    Math.min(
      SK_MAX_W,
      Math.max(
        0,
        ...steps.map((s) => textWidth(s.title, 14, true) + 60),
        ...steps.map((s) => (s.detail ? textWidth(s.detail, 11) + 60 : 0)),
      ),
    ),
  )

  let y = oy + 8
  const stepLayouts: FlowStepLayout[] = steps.map((s, i) => {
    const titleLines = wrapText(s.title, 14, w - 40, true).slice(0, 2)
    const detailLines = s.detail ? wrapText(s.detail, 11, w - 40) : []
    const h = SK_PAD_Y * 2 + titleLines.length * 19 + (detailLines.length ? 4 + detailLines.length * 15 : 0)
    const { fill, text } = flowFill(s, i)
    const out: FlowStepLayout = {
      id: s.id,
      path: `M ${x + 8} ${y} H ${x + w - 8} Q ${x + w} ${y} ${x + w} ${y + 8} V ${y + h - 8} Q ${x + w} ${y + h} ${x + w - 8} ${y + h} H ${x + 8} Q ${x} ${y + h} ${x} ${y + h - 8} V ${y + 8} Q ${x} ${y} ${x + 8} ${y} Z`,
      fill,
      text,
      titleLines,
      labelX: x + w / 2,
      labelY: y + SK_PAD_Y + (titleLines.length * 19) / 2,
      detail: detailLines.length
        ? { lines: detailLines, x: x + w / 2, y: y + SK_PAD_Y + titleLines.length * 19 + 12, anchor: 'middle' }
        : null,
    }
    y += h + SK_GAP
    return out
  })

  const flow: FlowLayout = { kind: 'stack', steps: stepLayouts, hub: null }
  return finishDataLayout(chart, x + w, y - SK_GAP, { flow })
}

export function layoutChart(input: OrgChart): Layout {
  // WBS numbering is a view concern: bake outline numbers into titles on a copy
  // so the deterministic layout and exports need no structural change.
  const chart = input.meta.showWbsNumbers ? withWbsNumbers(input) : input
  const mode = chart.meta.layout ?? 'tree'
  if (mode === 'radial') return layoutRadial(chart)
  if (mode === 'layered') return layoutLayered(chart)
  if (mode === 'matrix') return layoutMatrix(chart)
  if (mode === 'swimlane') return layoutSwimlane(chart)
  if (mode === 'timeline') return layoutTimeline(chart)
  if (mode === 'table') return layoutTable(chart)
  if (mode === 'risk') return layoutRisk(chart)
  if (mode === 'xy') return layoutXY(chart)
  if (mode === 'cycle') return layoutCycle(chart)
  if (mode === 'pipeline') return layoutPipeline(chart)
  if (mode === 'stack') return layoutStack(chart)
  if (mode === 'free') return layoutFree(chart)

  const dir: Direction = chart.meta.direction ?? 'TB'
  const vertical = dir === 'TB' || dir === 'BT'

  // 1) Lay out every root in logical (main, cross) space.
  const raw: Raw[] = []
  const rawConns: Polyline[] = []
  let crossCursor = 0
  for (const root of chart.roots) {
    const m = measureNode(root, vertical)
    placeNode(m, crossCursor, 0, raw, rawConns)
    crossCursor += m.subCross + M.rootGap
  }

  // 2) Map logical -> screen for the chosen direction. The title always sits at
  //    the top-left, so content is offset down by its height regardless of flow.
  const ox = M.canvasPad
  const oy = M.canvasPad + (chart.meta.showTitle && chart.meta.title.trim() ? 44 : 0)
  const maxMain = raw.reduce((mx, r) => Math.max(mx, r.main + r.m.mainSize), 0)

  const mapX = (cross: number, main: number) =>
    dir === 'LR' ? ox + main : dir === 'RL' ? ox + (maxMain - main) : ox + cross
  const mapY = (cross: number, main: number) =>
    dir === 'TB' ? oy + main : dir === 'BT' ? oy + (maxMain - main) : oy + cross

  const placed: PlacedNode[] = raw.map((r) => {
    const { m } = r
    // Same transform as the connectors; a flipped axis (BT/RL) references the
    // box's far main edge so its top-left stays on-canvas.
    return {
      node: m.node,
      x: mapX(r.cross, r.main) - (dir === 'RL' ? m.mainSize : 0),
      y: mapY(r.cross, r.main) - (dir === 'BT' ? m.mainSize : 0),
      w: m.w,
      headerH: m.headerH,
      totalH: m.totalH,
      titleLines: m.titleLines,
      leftAlign: m.leftAlign,
      bulletLines: m.bulletLines,
      detailBlocks: m.detailBlocks,
    }
  })

  const connectors: string[] = rawConns.map((poly) =>
    poly
      .map(([c, mn], i) => `${i === 0 ? 'M' : 'L'} ${mapX(c, mn)} ${mapY(c, mn)}`)
      .join(' '),
  )

  // Manual position overrides win over the auto layout; when present, connectors
  // are re-routed to follow the moved boxes.
  const moved = applyOverrides(placed)
  return assemble(chart, placed, moved ? hierarchyConnectors(chart, placed) : connectors)
}
