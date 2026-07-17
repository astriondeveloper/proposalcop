import { palette } from './theme'
import type { ZoneStyle } from './theme'

/** Semantic box style. 'hidden' is an invisible container used to build
 *  free-standing columns (no box is drawn; children are laid out from it). */
export type Variant = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'hidden'

/** Architecture-diagram shapes a box can take (the 'box' default is the
 *  classic org-chart rectangle). Rendered in every node layout. */
export type NodeShape = 'box' | 'pill' | 'cylinder' | 'cloud' | 'diamond'

export const NODE_SHAPES: NodeShape[] = ['box', 'pill', 'cylinder', 'cloud', 'diamond']

export function isNodeShape(v: unknown): v is NodeShape {
  return typeof v === 'string' && (NODE_SHAPES as string[]).includes(v)
}

export type BadgeType = 'keyGold' | 'keyGray' | 'cornerAccent'

export type LegendMarker =
  | 'keyGold'
  | 'keyGray'
  | 'cornerAccent'
  | 'boxPrimary'
  | 'boxSecondary'
  | 'boxTertiary'
  | 'boxAccent'
  | 'green'
  | 'blue'
  | 'orange'
  | 'dashed'
  | 'comm'

export interface DetailRow {
  /** Bold prefix, e.g. "PWS:", "Deliverables:", "Interface:". */
  label: string
  text: string
}

/** Kinds of solicitation reference a box can be traced to. */
export type RefKind = 'PWS' | 'SOW' | 'CDRL' | 'SectionL' | 'SectionM'

/** The reference kinds, in display order. */
export const REF_KINDS: RefKind[] = ['PWS', 'SOW', 'CDRL', 'SectionL', 'SectionM']

/** A structured solicitation reference carried by a node: which kind of
 *  document, and the paragraph / line id within it (e.g. PWS 3.2.1). This is
 *  the queryable counterpart of the freeform "PWS:" detail rows — it is what
 *  rolls boxes up into the compliance matrix. */
export interface NodeRef {
  kind: RefKind
  ref: string
}

/** An authoritative requirement in the chart's compliance register: the
 *  "must be covered" set that coverage and gap detection are computed against. */
export interface Requirement {
  id: string
  kind: RefKind
  ref: string
  title?: string
}

/** Chart-level compliance register. */
export interface Compliance {
  requirements: Requirement[]
}

/** Type guard for a reference kind. */
export function isRefKind(v: unknown): v is RefKind {
  return v === 'PWS' || v === 'SOW' || v === 'CDRL' || v === 'SectionL' || v === 'SectionM'
}

export interface OrgNode {
  id: string
  title: string
  /** Person name shown in italics under the title. */
  name?: string
  /** Draw a photo placeholder silhouette. */
  photo?: boolean
  bullets?: string[]
  /** White detail rows attached under the box (PWS / Deliverables / ...). */
  details?: DetailRow[]
  /** Structured solicitation references this box addresses (for compliance
   *  traceability). Independent of the display-only `details` rows. */
  refs?: NodeRef[]
  badges?: BadgeType[]
  variant: Variant
  /** Architecture shape (default 'box'): pill, database cylinder, cloud, or
   *  decision diamond. */
  shape?: NodeShape
  /** Optional fill override (hex). Wins over the variant color; text color is
   *  picked automatically for contrast. Clear it to fall back to the variant. */
  color?: string
  /** Optional width override in px (default from theme metrics). */
  width?: number
  /** Manual position override (top-left, in the layout's screen coordinates).
   *  Set by dragging the box on the canvas; clearing it restores auto-layout. */
  pos?: { x: number; y: number }
  /** How this node's children are arranged. */
  childLayout?: 'row' | 'stack'
  /** Transition-schedule fields, used only by the 'timeline' layout: the task's
   *  start offset and length in schedule units. A milestone renders as a diamond
   *  at `start` (its duration is ignored). */
  start?: number
  duration?: number
  milestone?: boolean
  children?: OrgNode[]
}

export interface Group {
  id: string
  label?: string
  style: ZoneStyle
  memberIds: string[]
}

export type EdgeStyle = 'solid' | 'dashed'
/** Which ends carry an arrowhead. */
export type EdgeArrow = 'none' | 'start' | 'end' | 'both'

export interface CommLink {
  id: string
  fromId: string
  toId: string
  /** @deprecated superseded by `arrow`; still read from older files. */
  twoWay?: boolean
  style?: EdgeStyle
  arrow?: EdgeArrow
  label?: string
}

/** Resolve an edge's arrowheads, honoring the legacy `twoWay` flag. */
export function edgeArrow(e: CommLink): EdgeArrow {
  if (e.arrow === 'none' || e.arrow === 'start' || e.arrow === 'end' || e.arrow === 'both') {
    return e.arrow
  }
  return e.twoWay === false ? 'end' : 'both'
}

/** Normalize an edge to the current shape: migrate `twoWay` to `arrow`,
 *  validate `style`, and keep a non-empty label. */
function normalizeEdge(e: CommLink): CommLink {
  const out: CommLink = {
    id: e.id,
    fromId: e.fromId,
    toId: e.toId,
    arrow: edgeArrow(e),
    style: e.style === 'dashed' ? 'dashed' : 'solid',
  }
  if (typeof e.label === 'string' && e.label.trim()) out.label = e.label
  return out
}

export interface LegendItem {
  id: string
  marker: LegendMarker
  label: string
}

/** Flow direction of the auto-layout: top-down, bottom-up, left-right, right-left. */
export type Direction = 'TB' | 'BT' | 'LR' | 'RL'

/** Auto-layout strategy:
 *  - 'tree'     tidy-tree hierarchy (honors a Direction)
 *  - 'radial'   root at the center, descendants on concentric rings
 *  - 'layered'  depth-aligned rows (Sugiyama-lite), cross-links pulled together
 *  - 'matrix'   2D grid: rows = depth, columns = group (or root)
 *  - 'swimlane' independent vertical lanes, one per group (or root)
 *  - 'timeline' transition / phase-in schedule: tasks as bars on a time axis
 *  - 'table'    a branded grid (RACI, compliance crosswalk, QASP/SLA, ...)
 *  - 'risk'     a 5×5 likelihood × consequence risk cube with markers
 *  - 'xy'       an X-Y chart: line / area / bar series over numeric axes
 *  - 'cycle'    a circular loop of steps (PDCA, continuous improvement)
 *  - 'pipeline' left-to-right chevron stages (DevSecOps, lifecycle phases)
 *  - 'stack'    full-width layers (technology stack)
 *  - 'free'     free-form diagramming: manual placement + explicit edges
 *               (system architecture, network topology, data flow) */
export type LayoutMode =
  | 'tree'
  | 'radial'
  | 'layered'
  | 'matrix'
  | 'swimlane'
  | 'timeline'
  | 'table'
  | 'risk'
  | 'xy'
  | 'cycle'
  | 'pipeline'
  | 'stack'
  | 'free'

/** Optional status coloring for a table cell (green / amber / red / blue tint). */
export type CellStatus = 'good' | 'warn' | 'bad' | 'info'

export interface TableColumn {
  label: string
  /** Fixed width in px; omitted columns size to their content. */
  width?: number
  align?: 'left' | 'center' | 'right'
}

export interface TableCell {
  text: string
  status?: CellStatus
}

export interface TableRow {
  cells: TableCell[]
  /** A full-width section header row (bold, tinted); `cells[0].text` is its label. */
  header?: boolean
}

/** A branded data table (the 'table' layout). */
export interface TableDef {
  columns: TableColumn[]
  rows: TableRow[]
  /** Alternate row shading. Default on. */
  zebra?: boolean
}

/* ----------------------------------------------------------- risk cube */

/** A position on the 5×5 risk cube (both axes run 1–5). */
export interface RiskPos {
  likelihood: number
  consequence: number
}

/** One entry in the risk register (drawn on the 'risk' layout). */
export interface RiskItem {
  id: string
  /** Short marker label drawn on the cube (e.g. "R1"). Auto-numbered when blank. */
  code?: string
  title: string
  likelihood: number
  consequence: number
  /** Post-mitigation (residual) position; draws an arrow from the current
   *  position to this one. */
  residual?: RiskPos
}

/** Configuration for the 'risk' layout: the risks plus optional axis titles. */
export interface RiskCube {
  risks: RiskItem[]
  /** Axis titles. Default "Consequence" (x) and "Likelihood" (y). */
  xLabel?: string
  yLabel?: string
}

export type RiskLevel = 'low' | 'moderate' | 'high'

/** Cell severity for the 5×5 cube, following the standard DoD-style risk
 *  reporting matrix (row = likelihood 1–5, column = consequence 1–5). Encoded
 *  as data so a customer-specific matrix is a one-table change. */
const RISK_MATRIX: RiskLevel[][] = [
  ['low', 'low', 'low', 'moderate', 'moderate'], // likelihood 1
  ['low', 'low', 'moderate', 'moderate', 'moderate'], // likelihood 2
  ['low', 'moderate', 'moderate', 'moderate', 'high'], // likelihood 3
  ['moderate', 'moderate', 'moderate', 'high', 'high'], // likelihood 4
  ['moderate', 'moderate', 'high', 'high', 'high'], // likelihood 5
]

/** Clamp a scale value to an integer 1–5. */
export function clampScale(v: number): number {
  return Math.min(5, Math.max(1, Math.round(v)))
}

/** Severity of a (likelihood, consequence) cell, both 1–5. */
export function riskLevel(likelihood: number, consequence: number): RiskLevel {
  return RISK_MATRIX[clampScale(likelihood) - 1][clampScale(consequence) - 1]
}

/** Validate a risk cube from untrusted input: clamp positions to 1–5, drop
 *  malformed entries and residuals, fill missing ids. Returns undefined when
 *  there is no cube at all (charts that don't use the risk layout). */
export function normalizeRisk(input: unknown): RiskCube | undefined {
  if (!input || typeof input !== 'object') return undefined
  const r = input as Partial<RiskCube>
  if (!Array.isArray(r.risks)) return undefined
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? clampScale(v) : null
  const risks: RiskItem[] = []
  for (const item of r.risks) {
    if (!item || typeof item !== 'object') continue
    const L = num((item as RiskItem).likelihood)
    const C = num((item as RiskItem).consequence)
    if (L === null || C === null) continue
    const rawId = (item as RiskItem).id
    const out: RiskItem = {
      id: typeof rawId === 'string' && rawId ? rawId : uid('r'),
      title: typeof (item as RiskItem).title === 'string' ? (item as RiskItem).title : '',
      likelihood: L,
      consequence: C,
    }
    const code = (item as RiskItem).code
    if (typeof code === 'string' && code.trim()) out.code = code.trim()
    const res = (item as RiskItem).residual
    if (res && typeof res === 'object') {
      const rl = num(res.likelihood)
      const rc = num(res.consequence)
      if (rl !== null && rc !== null) out.residual = { likelihood: rl, consequence: rc }
    }
    risks.push(out)
  }
  const out: RiskCube = { risks }
  if (typeof r.xLabel === 'string' && r.xLabel.trim()) out.xLabel = r.xLabel.trim()
  if (typeof r.yLabel === 'string' && r.yLabel.trim()) out.yLabel = r.yLabel.trim()
  return out
}

/* -------------------------------------------------------------- xy chart */

export type XYSeriesKind = 'line' | 'area' | 'bar'

export interface XYPoint {
  x: number
  y: number
}

/** One data series on the 'xy' layout. Color comes from the semantic box
 *  variants, so charts stay brand-locked. */
export interface XYSeries {
  id: string
  label: string
  kind: XYSeriesKind
  /** Semantic color. Defaults rotate primary → secondary → accent → tertiary. */
  variant?: Exclude<Variant, 'hidden'>
  points: XYPoint[]
}

/** Configuration for the 'xy' layout: staffing ramps, risk burndown, ROI,
 *  benefits curves — any numeric X-Y data. */
export interface XYChart {
  series: XYSeries[]
  xLabel?: string
  yLabel?: string
}

const XY_KINDS = ['line', 'area', 'bar']
const XY_VARIANTS = ['primary', 'secondary', 'tertiary', 'accent']

/** Parse "x, y" pairs, one per line (comma, space or tab separated). Lines
 *  that don't yield two finite numbers are skipped. */
export function parsePoints(text: string): XYPoint[] {
  const out: XYPoint[] = []
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/[\s,;]+/).filter(Boolean)
    if (parts.length < 2) continue
    const x = Number(parts[0])
    const y = Number(parts[1])
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y })
  }
  return out
}

/** Validate an xy-chart config from untrusted input: coerce series, keep only
 *  finite points, validate kinds and variants, fill ids. Returns undefined
 *  when there is no series array at all. */
export function normalizeXY(input: unknown): XYChart | undefined {
  if (!input || typeof input !== 'object') return undefined
  const c = input as Partial<XYChart>
  if (!Array.isArray(c.series)) return undefined
  const series: XYSeries[] = []
  for (const s of c.series) {
    if (!s || typeof s !== 'object') continue
    const rawId = (s as XYSeries).id
    const out: XYSeries = {
      id: typeof rawId === 'string' && rawId ? rawId : uid('s'),
      label: typeof (s as XYSeries).label === 'string' ? (s as XYSeries).label : '',
      kind: XY_KINDS.includes((s as XYSeries).kind) ? (s as XYSeries).kind : 'line',
      points: (Array.isArray((s as XYSeries).points) ? (s as XYSeries).points : [])
        .filter(
          (p): p is XYPoint =>
            !!p &&
            typeof p === 'object' &&
            typeof p.x === 'number' &&
            typeof p.y === 'number' &&
            Number.isFinite(p.x) &&
            Number.isFinite(p.y),
        )
        .map((p) => ({ x: p.x, y: p.y })),
    }
    const variant = (s as XYSeries).variant
    if (typeof variant === 'string' && XY_VARIANTS.includes(variant)) out.variant = variant
    series.push(out)
  }
  const out: XYChart = { series }
  if (typeof c.xLabel === 'string' && c.xLabel.trim()) out.xLabel = c.xLabel.trim()
  if (typeof c.yLabel === 'string' && c.yLabel.trim()) out.yLabel = c.yLabel.trim()
  return out
}

/** A labeled vertical marker on the schedule axis (e.g. a 30-day gate). */
export interface SchedulePhase {
  label: string
  at: number
}

/** Configuration for the 'timeline' layout. */
export interface Schedule {
  unit: 'day' | 'week' | 'month'
  /** Total units spanned by the axis. Defaults to the latest task end. */
  span?: number
  phases?: SchedulePhase[]
}

export interface OrgChart {
  version: 1
  meta: {
    title: string
    showTitle: boolean
    direction?: Direction
    layout?: LayoutMode
    /** Draw the compliance overlay (per-box status badges + a gaps panel) on
     *  the chart itself. Off unless explicitly enabled. */
    showComplianceOverlay?: boolean
    /** Prefix every visible box with a computed WBS outline number
     *  (1, 1.1, 1.1.1 ...). A view concern only — stored titles stay clean. */
    showWbsNumbers?: boolean
    /** Action caption rendered beneath the graphic and carried into exports. */
    caption?: string
    /** Classification / CUI marking rendered as top + bottom banners and carried
     *  into exports (e.g. "CUI", "UNCLASSIFIED//FOUO"). */
    banner?: string
    /** Win-theme banner strip rendered above the graphic (the message the
     *  evaluator should take away). */
    winTheme?: string
    /** Icon-based stat strip rendered beneath the graphic (headcount, past
     *  performance numbers, footprint...). */
    stats?: StatItem[]
    /** Customer / PWS pull quote rendered as a callout beneath the graphic. */
    quote?: PullQuote
  }
  /** Independent trees/columns laid out left to right. */
  roots: OrgNode[]
  groups: Group[]
  comms: CommLink[]
  legend: LegendItem[]
  /** Compliance register (optional). Absent on charts that don't track it. */
  compliance?: Compliance
  /** Transition-schedule config, used by the 'timeline' layout. */
  schedule?: Schedule
  /** Table definition, used by the 'table' layout. */
  table?: TableDef
  /** Risk register + axis titles, used by the 'risk' layout. */
  risk?: RiskCube
  /** Line / area / bar series, used by the 'xy' layout. */
  xy?: XYChart
  /** Steps shared by the 'cycle' / 'pipeline' / 'stack' layouts. */
  flow?: FlowDef
}

/* ------------------------------------------------ flow (cycle / pipeline / stack) */

/** One step in a flow diagram: a cycle segment, a pipeline chevron, or a
 *  stack layer, depending on the chart's layout mode. */
export interface FlowStep {
  id: string
  title: string
  /** Short supporting line (security gate, layer contents, ...). */
  detail?: string
  /** Semantic color. Defaults rotate primary → secondary → tertiary → accent. */
  variant?: Exclude<Variant, 'hidden'>
}

/** Configuration shared by the 'cycle', 'pipeline' and 'stack' layouts. The
 *  same steps re-render as a loop, as chevrons, or as layers when the layout
 *  mode changes. */
export interface FlowDef {
  steps: FlowStep[]
  /** Label drawn in the middle of a cycle (e.g. "Continuous Improvement"). */
  hub?: string
}

const FLOW_VARIANTS = ['primary', 'secondary', 'tertiary', 'accent']

/** Validate a flow config from untrusted input: coerce steps, validate
 *  variants, fill ids. Returns undefined when there is no steps array. */
export function normalizeFlow(input: unknown): FlowDef | undefined {
  if (!input || typeof input !== 'object') return undefined
  const f = input as Partial<FlowDef>
  if (!Array.isArray(f.steps)) return undefined
  const steps: FlowStep[] = []
  for (const s of f.steps) {
    if (!s || typeof s !== 'object') continue
    const rawId = (s as FlowStep).id
    const out: FlowStep = {
      id: typeof rawId === 'string' && rawId ? rawId : uid('f'),
      title: typeof (s as FlowStep).title === 'string' ? (s as FlowStep).title : '',
    }
    const detail = (s as FlowStep).detail
    if (typeof detail === 'string' && detail.trim()) out.detail = detail.trim()
    const variant = (s as FlowStep).variant
    if (typeof variant === 'string' && FLOW_VARIANTS.includes(variant)) out.variant = variant
    steps.push(out)
  }
  const out: FlowDef = { steps }
  if (typeof f.hub === 'string' && f.hub.trim()) out.hub = f.hub.trim()
  return out
}

/* ---------------------------------------------------- persuasion elements */

/** Built-in glyphs for the stat strip, drawn by the renderer (brand-locked —
 *  no arbitrary images). */
export type StatIcon = 'people' | 'clock' | 'shield' | 'star' | 'check' | 'chart' | 'globe' | 'award'

export const STAT_ICONS: StatIcon[] = ['people', 'clock', 'shield', 'star', 'check', 'chart', 'globe', 'award']

/** One tile in the stat strip: a big number with a label, e.g. "99.9%" /
 *  "system availability". */
export interface StatItem {
  value: string
  label: string
  icon?: StatIcon
}

/** A customer / PWS pull quote rendered as a callout beneath the graphic. */
export interface PullQuote {
  text: string
  /** Attribution, e.g. "PWS §3.2" or "CPARS, FY24". */
  source?: string
}

function isStatIcon(v: unknown): v is StatIcon {
  return typeof v === 'string' && (STAT_ICONS as string[]).includes(v)
}

/** Validate a stat strip from untrusted input: keep items with any text,
 *  drop unknown icons. Returns undefined when nothing valid remains. */
export function normalizeStats(input: unknown): StatItem[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: StatItem[] = []
  for (const s of input) {
    if (!s || typeof s !== 'object') continue
    const value = typeof (s as StatItem).value === 'string' ? (s as StatItem).value.trim() : ''
    const label = typeof (s as StatItem).label === 'string' ? (s as StatItem).label.trim() : ''
    if (!value && !label) continue
    const item: StatItem = { value, label }
    if (isStatIcon((s as StatItem).icon)) item.icon = (s as StatItem).icon
    out.push(item)
  }
  return out.length ? out : undefined
}

/** Validate a pull quote from untrusted input. */
export function normalizeQuote(input: unknown): PullQuote | undefined {
  if (!input || typeof input !== 'object') return undefined
  const text = typeof (input as PullQuote).text === 'string' ? (input as PullQuote).text.trim() : ''
  if (!text) return undefined
  const out: PullQuote = { text }
  const source = (input as PullQuote).source
  if (typeof source === 'string' && source.trim()) out.source = source.trim()
  return out
}

/* ------------------------------------------------- data-element selection */

/**
 * The app has one selection channel (a string id). Node layouts select boxes
 * by the node's own id; elements of the data layouts (table cells/columns,
 * risks, xy series) use these prefixed forms so clicking them on the canvas
 * can drive the matching side-panel editor.
 */
export type DataSelection =
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'col'; col: number }
  | { kind: 'risk'; id: string }
  | { kind: 'series'; id: string }
  | { kind: 'step'; id: string }

export const cellSelId = (row: number, col: number): string => `cell:${row}:${col}`
export const colSelId = (col: number): string => `col:${col}`
export const riskSelId = (id: string): string => `risk:${id}`
export const seriesSelId = (id: string): string => `series:${id}`
export const stepSelId = (id: string): string => `step:${id}`

/** Parse a selection id into its data-element form, or null when it is not a
 *  data-element id (e.g. a node id, or nothing selected). */
export function parseSelection(sel: string | null | undefined): DataSelection | null {
  if (!sel) return null
  const parts = sel.split(':')
  if (parts[0] === 'cell' && parts.length === 3) {
    const row = Number(parts[1])
    const col = Number(parts[2])
    if (Number.isInteger(row) && row >= 0 && Number.isInteger(col) && col >= 0) {
      return { kind: 'cell', row, col }
    }
    return null
  }
  if (parts[0] === 'col' && parts.length === 2) {
    const col = Number(parts[1])
    return Number.isInteger(col) && col >= 0 ? { kind: 'col', col } : null
  }
  if (parts[0] === 'risk' && parts.length >= 2) {
    const id = parts.slice(1).join(':')
    return id ? { kind: 'risk', id } : null
  }
  if (parts[0] === 'series' && parts.length >= 2) {
    const id = parts.slice(1).join(':')
    return id ? { kind: 'series', id } : null
  }
  if (parts[0] === 'step' && parts.length >= 2) {
    const id = parts.slice(1).join(':')
    return id ? { kind: 'step', id } : null
  }
  return null
}

let counter = 0
export function uid(prefix = 'n'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`
}

export function emptyChart(): OrgChart {
  return {
    version: 1,
    meta: { title: 'New Org Chart', showTitle: true },
    roots: [
      {
        id: uid(),
        title: 'Program Manager',
        variant: 'primary',
        childLayout: 'row',
        children: [],
      },
    ],
    groups: [],
    comms: [],
    legend: [],
  }
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Depth-first visit over every node in the chart. */
export function visit(
  roots: OrgNode[],
  fn: (node: OrgNode, parent: OrgNode | null, depth: number) => void,
): void {
  const walk = (n: OrgNode, parent: OrgNode | null, depth: number) => {
    fn(n, parent, depth)
    for (const c of n.children ?? []) walk(c, n, depth + 1)
  }
  for (const r of roots) walk(r, null, 0)
}

export function allNodes(chart: OrgChart): { node: OrgNode; depth: number }[] {
  const out: { node: OrgNode; depth: number }[] = []
  visit(chart.roots, (node, _p, depth) => out.push({ node, depth }))
  return out
}

/**
 * Compute WBS outline numbers (1, 1.1, 1.1.1 ...) for every visible node,
 * returning a map from node id to its number. Hidden containers are transparent:
 * their visible children join the parent level's sequence. Structural (does not
 * depend on the showWbsNumbers view flag), so exports and the view can share it.
 */
export function wbsNumbers(roots: OrgNode[]): Map<string, string> {
  const map = new Map<string, string>()
  const walk = (list: OrgNode[], prefix: string) => {
    let idx = 0
    const process = (nodes: OrgNode[]) => {
      for (const n of nodes) {
        if (n.variant === 'hidden') {
          process(n.children ?? [])
          continue
        }
        idx += 1
        const num = prefix ? `${prefix}.${idx}` : `${idx}`
        map.set(n.id, num)
        walk(n.children ?? [], num)
      }
    }
    process(list)
  }
  walk(roots, '')
  return map
}

/**
 * Detect the legend entries a chart implies: one per box variant, badge, group
 * zone style, and comm link actually present. Zone labels reuse the group's own
 * label when it has one. Callers merge these into the chart's legend.
 */
export function autoLegend(chart: OrgChart): LegendItem[] {
  const variants = new Set<Variant>()
  const badges = new Set<BadgeType>()
  visit(chart.roots, (n) => {
    if (n.variant !== 'hidden') variants.add(n.variant)
    for (const b of n.badges ?? []) badges.add(b)
  })
  const zoneStyles = new Set(chart.groups.map((g) => g.style))
  const zoneLabel = (style: ZoneStyle, fallback: string) =>
    chart.groups.find((g) => g.style === style && g.label)?.label ?? fallback

  const items: LegendItem[] = []
  const add = (marker: LegendMarker, label: string) => items.push({ id: uid('l'), marker, label })

  if (variants.has('primary')) add('boxPrimary', 'Primary')
  if (variants.has('secondary')) add('boxSecondary', 'Secondary')
  if (variants.has('tertiary')) add('boxTertiary', 'Tertiary')
  if (variants.has('accent')) add('boxAccent', 'Accent')
  if (badges.has('keyGold')) add('keyGold', 'RFP Required')
  if (badges.has('keyGray')) add('keyGray', 'Company Designated')
  if (badges.has('cornerAccent')) add('cornerAccent', 'Similar Technical Support Areas')
  if (zoneStyles.has('green')) add('green', zoneLabel('green', 'Highlighted zone'))
  if (zoneStyles.has('blue')) add('blue', zoneLabel('blue', 'Grouped zone'))
  if (zoneStyles.has('orange')) add('orange', zoneLabel('orange', 'Grouped zone'))
  if (zoneStyles.has('dashed')) add('dashed', zoneLabel('dashed', 'Container'))
  if (chart.comms.length) add('comm', 'Communication')
  return items
}

/** The complete set of on-brand fill values (uppercased for comparison). */
const BRAND_COLORS = new Set<string>(Object.values(palette).map((c) => c.toUpperCase()))

/**
 * Drop any box `color` override that is not an Astrion brand color, so a chart
 * can never render off-brand — even when hand-edited via the JSON tab or loaded
 * from an imported/older file. Mutates the passed chart (callers pass a freshly
 * parsed object) and returns it.
 */
export function sanitizeColors(chart: OrgChart): OrgChart {
  visit(chart.roots, (n) => {
    if (n.color && !BRAND_COLORS.has(n.color.toUpperCase())) delete n.color
    // Unknown shapes from hand-edited or imported files fall back to the box.
    if (n.shape !== undefined && !isNodeShape(n.shape)) delete n.shape
  })
  return chart
}

/**
 * Drop any malformed manual position (missing or non-finite coordinates) from
 * an untrusted chart, so the layout engine never receives NaN geometry from a
 * hand-edited JSON tab or an imported file. Mutates and returns the chart.
 */
export function sanitizePositions(chart: OrgChart): OrgChart {
  visit(chart.roots, (n) => {
    const p = n.pos
    if (p && !(Number.isFinite(p.x) && Number.isFinite(p.y))) delete n.pos
  })
  return chart
}

/** Keep only well-formed node references (valid kind + non-empty ref string),
 *  trimming the ref. Drops the whole `refs` field when nothing valid remains,
 *  so a hand-edited or imported chart never carries junk references. */
export function sanitizeRefs(chart: OrgChart): OrgChart {
  visit(chart.roots, (n) => {
    if (!Array.isArray(n.refs)) {
      if (n.refs !== undefined) delete n.refs
      return
    }
    const out: NodeRef[] = []
    for (const r of n.refs) {
      if (r && typeof r === 'object' && isRefKind(r.kind)) {
        const ref = String(r.ref ?? '').trim()
        if (ref) out.push({ kind: r.kind, ref })
      }
    }
    if (out.length) n.refs = out
    else delete n.refs
  })
  return chart
}

/** Validate and de-duplicate a compliance register from untrusted input. Drops
 *  malformed requirements (bad kind or empty ref), fills a fresh id when one is
 *  missing, and collapses duplicate (kind, ref) pairs. Returns undefined when
 *  nothing valid remains. */
export function normalizeCompliance(input: unknown): Compliance | undefined {
  if (!input || typeof input !== 'object') return undefined
  const reqs = (input as Compliance).requirements
  if (!Array.isArray(reqs)) return undefined
  const seen = new Set<string>()
  const out: Requirement[] = []
  for (const r of reqs) {
    if (!r || typeof r !== 'object') continue
    const kind = (r as Requirement).kind
    if (!isRefKind(kind)) continue
    const ref = String((r as Requirement).ref ?? '').trim()
    if (!ref) continue
    const key = `${kind} ${ref.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const rawId = (r as Requirement).id
    const id = typeof rawId === 'string' && rawId ? rawId : uid('req')
    const rawTitle = (r as Requirement).title
    const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : undefined
    out.push(title ? { id, kind, ref, title } : { id, kind, ref })
  }
  return out.length ? { requirements: out } : undefined
}

export function findNode(chart: OrgChart, id: string): OrgNode | null {
  let found: OrgNode | null = null
  visit(chart.roots, (n) => {
    if (n.id === id) found = n
  })
  return found
}

/** Returns the array containing the node and its index (roots array for top level). */
export function findContainer(
  chart: OrgChart,
  id: string,
): { list: OrgNode[]; index: number; parent: OrgNode | null } | null {
  const idx = chart.roots.findIndex((r) => r.id === id)
  if (idx >= 0) return { list: chart.roots, index: idx, parent: null }
  let result: { list: OrgNode[]; index: number; parent: OrgNode | null } | null = null
  visit(chart.roots, (n) => {
    const children = n.children ?? []
    const i = children.findIndex((c) => c.id === id)
    if (i >= 0 && !result) result = { list: children, index: i, parent: n }
  })
  return result
}

/** All mutation helpers clone the chart so React state stays immutable. */
export function updateNode(chart: OrgChart, id: string, patch: Partial<OrgNode>): OrgChart {
  const next = clone(chart)
  const n = findNode(next, id)
  if (n) Object.assign(n, patch)
  return next
}

export function addChild(chart: OrgChart, parentId: string): { chart: OrgChart; newId: string } {
  const next = clone(chart)
  const parent = findNode(next, parentId)
  const newId = uid()
  if (parent) {
    parent.children = parent.children ?? []
    parent.children.push({ id: newId, title: 'New Box', variant: 'secondary', childLayout: 'row' })
  }
  return { chart: next, newId }
}

export function addSibling(chart: OrgChart, id: string): { chart: OrgChart; newId: string } {
  const next = clone(chart)
  const loc = findContainer(next, id)
  const newId = uid()
  if (loc) {
    const ref = loc.list[loc.index]
    loc.list.splice(loc.index + 1, 0, {
      id: newId,
      title: 'New Box',
      variant: ref.variant === 'hidden' ? 'secondary' : ref.variant,
      childLayout: 'row',
    })
  }
  return { chart: next, newId }
}

export function addRoot(chart: OrgChart): { chart: OrgChart; newId: string } {
  const next = clone(chart)
  const newId = uid()
  next.roots.push({ id: newId, title: 'New Tree', variant: 'primary', childLayout: 'row' })
  return { chart: next, newId }
}

export function deleteNode(chart: OrgChart, id: string): OrgChart {
  const next = clone(chart)
  const loc = findContainer(next, id)
  if (loc && !(loc.parent === null && next.roots.length === 1)) {
    loc.list.splice(loc.index, 1)
  }
  // Clean up references in groups/comms.
  const gone = new Set<string>()
  const known = new Set<string>()
  visit(next.roots, (n) => known.add(n.id))
  visit(chart.roots, (n) => {
    if (!known.has(n.id)) gone.add(n.id)
  })
  next.groups = next.groups.map((g) => ({
    ...g,
    memberIds: g.memberIds.filter((m) => !gone.has(m)),
  }))
  next.comms = next.comms.filter((c) => !gone.has(c.fromId) && !gone.has(c.toId))
  return next
}

/** Set or clear a node's manual position override (top-left in layout coords). */
export function setNodePos(
  chart: OrgChart,
  id: string,
  pos: { x: number; y: number } | null,
): OrgChart {
  const next = clone(chart)
  const n = findNode(next, id)
  if (n) {
    if (pos) n.pos = { x: pos.x, y: pos.y }
    else delete n.pos
  }
  return next
}

export function moveNode(chart: OrgChart, id: string, dir: -1 | 1): OrgChart {
  const next = clone(chart)
  const loc = findContainer(next, id)
  if (!loc) return chart
  const j = loc.index + dir
  if (j < 0 || j >= loc.list.length) return chart
  const [n] = loc.list.splice(loc.index, 1)
  loc.list.splice(j, 0, n)
  return next
}

/** Deep-copy a subtree, assigning fresh ids to every node. */
function copyWithNewIds(node: OrgNode): OrgNode {
  return {
    ...clone(node),
    id: uid(),
    children: (node.children ?? []).map(copyWithNewIds),
  }
}

/** Duplicate a node (and its whole subtree) as the next sibling. */
export function duplicateNode(chart: OrgChart, id: string): { chart: OrgChart; newId: string } {
  const next = clone(chart)
  const loc = findContainer(next, id)
  if (!loc) return { chart, newId: id }
  const copy = copyWithNewIds(loc.list[loc.index])
  loc.list.splice(loc.index + 1, 0, copy)
  return { chart: next, newId: copy.id }
}

/** Current chart schema version. Bump when the shape changes and add a branch
 *  in {@link normalizeChart} to migrate older documents forward. */
export const CHART_VERSION = 1

/**
 * Validate and normalize an untrusted chart (from localStorage, an imported
 * file, or the JSON tab): fill defaults, coerce the shape, migrate old versions
 * forward, and strip off-brand colors. Throws a clear message on invalid input.
 */
export function normalizeChart(input: unknown): OrgChart {
  if (!input || typeof input !== 'object') throw new Error('Not a chart object.')
  const c = input as Partial<OrgChart> & { meta?: Partial<OrgChart['meta']> }
  if (!Array.isArray(c.roots) || c.roots.length === 0) {
    throw new Error('Missing a non-empty "roots" array.')
  }
  const dir = c.meta?.direction
  const dirOk = dir === 'TB' || dir === 'BT' || dir === 'LR' || dir === 'RL'
  const layout = c.meta?.layout
  const LAYOUTS = [
    'tree',
    'radial',
    'layered',
    'matrix',
    'swimlane',
    'timeline',
    'table',
    'risk',
    'xy',
    'cycle',
    'pipeline',
    'stack',
    'free',
  ]
  const layoutOk = typeof layout === 'string' && LAYOUTS.includes(layout)
  const chart: OrgChart = {
    version: CHART_VERSION,
    meta: {
      title: typeof c.meta?.title === 'string' ? c.meta.title : 'Org Chart',
      showTitle: c.meta?.showTitle !== false,
      ...(dirOk ? { direction: dir } : {}),
      ...(layoutOk ? { layout } : {}),
      ...(c.meta?.showComplianceOverlay === true ? { showComplianceOverlay: true } : {}),
      ...(c.meta?.showWbsNumbers === true ? { showWbsNumbers: true } : {}),
      ...(typeof c.meta?.caption === 'string' && c.meta.caption.trim() ? { caption: c.meta.caption } : {}),
      ...(typeof c.meta?.banner === 'string' && c.meta.banner.trim() ? { banner: c.meta.banner } : {}),
      ...(typeof c.meta?.winTheme === 'string' && c.meta.winTheme.trim() ? { winTheme: c.meta.winTheme } : {}),
    },
    roots: c.roots as OrgNode[],
    groups: Array.isArray(c.groups) ? c.groups : [],
    comms: Array.isArray(c.comms) ? c.comms.map(normalizeEdge) : [],
    legend: Array.isArray(c.legend) ? c.legend : [],
  }
  const stats = normalizeStats(c.meta?.stats)
  if (stats) chart.meta.stats = stats
  const quote = normalizeQuote(c.meta?.quote)
  if (quote) chart.meta.quote = quote
  const compliance = normalizeCompliance(c.compliance)
  if (compliance) chart.compliance = compliance
  const schedule = normalizeSchedule(c.schedule)
  if (schedule) chart.schedule = schedule
  const table = normalizeTable(c.table)
  if (table) chart.table = table
  const risk = normalizeRisk(c.risk)
  if (risk) chart.risk = risk
  const xy = normalizeXY(c.xy)
  if (xy) chart.xy = xy
  const flow = normalizeFlow(c.flow)
  if (flow) chart.flow = flow
  return sanitizeRefs(sanitizePositions(sanitizeColors(chart)))
}

const CELL_STATUSES = ['good', 'warn', 'bad', 'info']

/** Validate a table definition from untrusted input: coerce columns/rows/cells
 *  to the current shape, keep known cell statuses, drop malformed entries.
 *  Returns undefined when there are no columns. */
export function normalizeTable(input: unknown): TableDef | undefined {
  if (!input || typeof input !== 'object') return undefined
  const t = input as Partial<TableDef>
  if (!Array.isArray(t.columns) || t.columns.length === 0) return undefined
  const columns: TableColumn[] = t.columns
    .filter((c): c is TableColumn => !!c && typeof c === 'object')
    .map((c) => {
      const col: TableColumn = { label: typeof c.label === 'string' ? c.label : '' }
      if (typeof c.width === 'number' && Number.isFinite(c.width) && c.width > 0) col.width = c.width
      if (c.align === 'left' || c.align === 'center' || c.align === 'right') col.align = c.align
      return col
    })
  if (!columns.length) return undefined
  const rows: TableRow[] = (Array.isArray(t.rows) ? t.rows : [])
    .filter((r): r is TableRow => !!r && typeof r === 'object' && Array.isArray(r.cells))
    .map((r) => {
      const cells: TableCell[] = r.cells
        .filter((c): c is TableCell => !!c && typeof c === 'object')
        .map((c) => {
          const cell: TableCell = { text: typeof c.text === 'string' ? c.text : '' }
          if (typeof c.status === 'string' && CELL_STATUSES.includes(c.status)) cell.status = c.status
          return cell
        })
      const row: TableRow = { cells }
      if (r.header === true) row.header = true
      return row
    })
  const out: TableDef = { columns, rows }
  if (t.zebra === false) out.zebra = false
  return out
}

/* ------------------------------------------------- table editing helpers */

/** A small starter grid for a chart that just switched to the table layout. */
export function emptyTable(): TableDef {
  return {
    columns: [
      { label: 'Item', width: 180, align: 'left' },
      { label: 'Column B' },
      { label: 'Column C' },
    ],
    rows: [
      { cells: [{ text: '' }, { text: '' }, { text: '' }] },
      { cells: [{ text: '' }, { text: '' }, { text: '' }] },
    ],
  }
}

/** Pad a data row's cells to the column count so positional edits (move /
 *  remove column) stay aligned. Section-header rows keep their single cell. */
function padRow(row: TableRow, columns: number): TableRow {
  if (row.header) return row
  const cells = [...row.cells]
  while (cells.length < columns) cells.push({ text: '' })
  return { ...row, cells }
}

/** Insert a column at `at` (default: append). Data rows gain an empty cell. */
export function tableAddColumn(t: TableDef, at = t.columns.length): TableDef {
  const next = clone(t)
  const i = Math.max(0, Math.min(next.columns.length, at))
  next.columns.splice(i, 0, { label: `Column ${String.fromCharCode(65 + (next.columns.length % 26))}` })
  next.rows = next.rows.map((r) => {
    if (r.header) return r
    const row = padRow(r, next.columns.length - 1)
    row.cells.splice(i, 0, { text: '' })
    return row
  })
  return next
}

/** Remove column `i`. Refused (returned unchanged) for the last column. */
export function tableRemoveColumn(t: TableDef, i: number): TableDef {
  if (t.columns.length <= 1 || i < 0 || i >= t.columns.length) return t
  const next = clone(t)
  next.columns.splice(i, 1)
  next.rows = next.rows.map((r) => {
    if (r.header) return r
    const row = padRow(r, next.columns.length + 1)
    row.cells.splice(i, 1)
    return row
  })
  return next
}

/** Swap column `i` with its neighbor in `dir`, carrying every data cell. */
export function tableMoveColumn(t: TableDef, i: number, dir: -1 | 1): TableDef {
  const j = i + dir
  if (i < 0 || i >= t.columns.length || j < 0 || j >= t.columns.length) return t
  const next = clone(t)
  ;[next.columns[i], next.columns[j]] = [next.columns[j], next.columns[i]]
  next.rows = next.rows.map((r) => {
    if (r.header) return r
    const row = padRow(r, next.columns.length)
    ;[row.cells[i], row.cells[j]] = [row.cells[j], row.cells[i]]
    return row
  })
  return next
}

/** Insert a row at `at` (default: append) — a data row, or a section header. */
export function tableAddRow(t: TableDef, at = t.rows.length, header = false): TableDef {
  const next = clone(t)
  const i = Math.max(0, Math.min(next.rows.length, at))
  const row: TableRow = header
    ? { header: true, cells: [{ text: 'Section' }] }
    : { cells: next.columns.map(() => ({ text: '' })) }
  next.rows.splice(i, 0, row)
  return next
}

export function tableRemoveRow(t: TableDef, i: number): TableDef {
  if (i < 0 || i >= t.rows.length) return t
  const next = clone(t)
  next.rows.splice(i, 1)
  return next
}

export function tableMoveRow(t: TableDef, i: number, dir: -1 | 1): TableDef {
  const j = i + dir
  if (i < 0 || i >= t.rows.length || j < 0 || j >= t.rows.length) return t
  const next = clone(t)
  ;[next.rows[i], next.rows[j]] = [next.rows[j], next.rows[i]]
  return next
}

/** Validate a schedule config from untrusted input. Keeps a known unit, a
 *  finite positive span if present, and well-formed phase markers. */
export function normalizeSchedule(input: unknown): Schedule | undefined {
  if (!input || typeof input !== 'object') return undefined
  const s = input as Partial<Schedule>
  const unit = s.unit === 'day' || s.unit === 'week' || s.unit === 'month' ? s.unit : 'day'
  const out: Schedule = { unit }
  if (typeof s.span === 'number' && Number.isFinite(s.span) && s.span > 0) out.span = s.span
  if (Array.isArray(s.phases)) {
    const phases = s.phases
      .filter(
        (p): p is SchedulePhase =>
          !!p && typeof p === 'object' && typeof p.at === 'number' && Number.isFinite(p.at),
      )
      .map((p) => ({ label: typeof p.label === 'string' ? p.label : '', at: p.at }))
    if (phases.length) out.phases = phases
  }
  return out
}
