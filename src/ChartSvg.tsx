import { memo } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'
import { textWidth } from './layout'
import type { ComplianceOverlay, Layout, PlacedNode } from './layout'
import { REF_KIND_LABEL } from './compliance'
import { cellSelId, colSelId, edgeArrow, parseSelection, riskSelId, seriesSelId, stepSelId } from './model'
import type { BadgeType, LegendMarker } from './model'
import { brand, metrics as M, readableText, riskFill, variantFill, zoneFill } from './theme'

/* Compliance overlay colors (brand Refraction / Twilight), inlined so the
 * exported SVG stays self-contained. */
const COMPLY_OK = '#1ED872'
const COMPLY_BAD = '#FC5442'
const COMPLY_TRACK = '#F3D6D1'

/*
 * Pure SVG renderer. Everything is drawn with inline attributes (no CSS
 * classes) so the exported SVG is fully self-contained and drops cleanly
 * into PowerPoint / Word.
 */

interface Props {
  layout: Layout
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Begin a drag-to-reposition gesture on a box. */
  onNodePointerDown?: (id: string, e: ReactPointerEvent) => void
  /** Accessible summary of the chart, announced to screen readers. */
  ariaLabel?: string
}

function KeyIcon({ x, y, color }: { x: number; y: number; color: string }) {
  // Small horizontal key glyph (bow on the left, teeth on the right).
  return (
    <g transform={`translate(${x}, ${y})`} stroke={color} fill="none" strokeWidth={1.8}>
      <circle cx={3.5} cy={5} r={3} />
      <path d="M 6.5 5 H 15 M 12 5 V 8.2 M 15 5 V 8.2" strokeLinecap="round" />
    </g>
  )
}

function badgeGlyphs(p: PlacedNode): JSX.Element[] {
  const glyphs: JSX.Element[] = []
  const badges = p.node.badges ?? []
  let right = p.x + p.w - 22
  for (const b of badges as BadgeType[]) {
    if (b === 'keyGold' || b === 'keyGray') {
      glyphs.push(
        <KeyIcon
          key={`${p.node.id}-${b}`}
          x={right}
          y={p.y + 5}
          color={b === 'keyGold' ? brand.keyGold : '#D7DDE4'}
        />,
      )
      right -= 20
    } else if (b === 'cornerAccent') {
      glyphs.push(
        <path
          key={`${p.node.id}-corner`}
          d={`M ${p.x} ${p.y} h 15 L ${p.x} ${p.y + 15} Z`}
          fill={brand.marker}
        />,
      )
    }
  }
  return glyphs
}

function PhotoPlaceholder({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx={15} cy={15} r={15} fill="#E7ECF2" />
      <circle cx={15} cy={11.5} r={5} fill="#9AA8B8" />
      <path d="M 5.5 26 a 9.5 8 0 0 1 19 0 Z" fill="#9AA8B8" />
    </g>
  )
}

/** Bottom-right corner status stamp shown when the compliance overlay is on and
 *  the box carries references: green check = every reference traces to the
 *  register; red "!" = at least one reference is not registered. */
function ComplianceBadge({ p, status }: { p: PlacedNode; status: 'ok' | 'orphan' }) {
  const cx = p.x + p.w - 11
  const cy = p.y + p.totalH - 11
  const color = status === 'ok' ? COMPLY_OK : COMPLY_BAD
  const refs = (p.node.refs ?? []).map((r) => `${REF_KIND_LABEL[r.kind]} ${r.ref}`).join(', ')
  return (
    <g style={{ pointerEvents: 'none' }}>
      <title>{status === 'ok' ? `References traced: ${refs}` : `Reference not in register: ${refs}`}</title>
      <circle cx={cx} cy={cy} r={8.5} fill={color} stroke={brand.white} strokeWidth={1.5} />
      {status === 'ok' ? (
        <path
          d={`M ${cx - 3.6} ${cy + 0.2} l 2.4 2.5 l 4.6 -5`}
          fill="none"
          stroke={brand.white}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <g stroke={brand.white} strokeWidth={1.7} strokeLinecap="round">
          <line x1={cx} y1={cy - 3.6} x2={cx} y2={cy + 1.4} />
          <line x1={cx} y1={cy + 3.8} x2={cx} y2={cy + 4} />
        </g>
      )}
    </g>
  )
}

/** The colored header silhouette for a box, by its architecture shape. All
 *  shapes are plain SVG primitives so exports (including PPTX) stay native. */
function HeaderShape({ p, fill }: { p: PlacedNode; fill: string }) {
  const { x, y, w } = p
  const h = p.headerH
  const shape = p.node.shape ?? 'box'
  if (shape === 'pill') return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />
  if (shape === 'diamond') {
    const cx = x + w / 2
    const cy = y + h / 2
    return <path d={`M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`} fill={fill} />
  }
  if (shape === 'cylinder') {
    const ry = 10
    return (
      <g>
        <path
          d={`M ${x} ${y + ry} V ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry} V ${y + ry} Z`}
          fill={fill}
        />
        <ellipse cx={x + w / 2} cy={y + ry} rx={w / 2} ry={ry} fill={fill} stroke="rgba(255,255,255,0.55)" strokeWidth={1.2} />
      </g>
    )
  }
  if (shape === 'cloud') {
    // A cloud silhouette from overlapping primitives sharing one fill, so the
    // PPTX transpiler exports it as native shapes too.
    return (
      <g fill={fill}>
        <rect x={x + w * 0.06} y={y + h * 0.45} width={w * 0.88} height={h * 0.55} rx={h * 0.26} />
        <circle cx={x + w * 0.32} cy={y + h * 0.44} r={h * 0.3} />
        <circle cx={x + w * 0.55} cy={y + h * 0.34} r={h * 0.36} />
        <circle cx={x + w * 0.74} cy={y + h * 0.46} r={h * 0.27} />
      </g>
    )
  }
  return <rect x={x} y={y} width={w} height={h} rx={M.boxRadius} fill={fill} />
}

function NodeBox({
  p,
  selected,
  compliance,
  onSelect,
  onPointerDown,
}: {
  p: PlacedNode
  selected: boolean
  compliance?: 'ok' | 'orphan' | null
  onSelect?: (id: string) => void
  onPointerDown?: (id: string, e: ReactPointerEvent) => void
}) {
  const v = p.node.color
    ? { fill: p.node.color, text: readableText(p.node.color) }
    : (variantFill[p.node.variant] ?? variantFill.secondary)
  const padX = M.padX
  const photo = p.node.photo
  const contentX = p.x + padX + (photo ? 38 : 0)
  const centerX = p.x + p.w / 2
  const shape = p.node.shape ?? 'box'

  let ty = p.y + M.padY + M.titleLineH - 5
  // Nudge cylinder content below the top ellipse.
  if (shape === 'cylinder') ty += 7
  const contentH =
    p.titleLines.length * M.titleLineH +
    (p.node.name ? M.nameLineH : 0) +
    (p.bulletLines.length ? 6 + p.bulletLines.length * M.bulletLineH : 0)
  // Vertically center content in the header.
  ty += Math.max(0, (p.headerH - M.padY * 2 - contentH) / 2)

  const titleEls = p.titleLines.map((line, i) => (
    <text
      key={`t${i}`}
      x={p.leftAlign ? contentX : centerX}
      y={ty + i * M.titleLineH}
      fontSize={M.titleSize}
      fontWeight={700}
      fill={v.text}
      textAnchor={p.leftAlign ? 'start' : 'middle'}
      fontFamily={brand.fontFamily}
    >
      {line}
    </text>
  ))
  let cursorY = ty + p.titleLines.length * M.titleLineH

  const extras: JSX.Element[] = []
  if (p.leftAlign) {
    extras.push(
      <line
        key="underline"
        x1={contentX}
        y1={cursorY - M.titleLineH + 9}
        x2={p.x + p.w - padX}
        y2={cursorY - M.titleLineH + 9}
        stroke={v.text === brand.white ? 'rgba(255,255,255,0.45)' : 'rgba(34,34,48,0.3)'}
        strokeWidth={1}
      />,
    )
  }
  if (p.node.name) {
    extras.push(
      <text
        key="name"
        x={p.leftAlign ? contentX + 8 : centerX}
        y={cursorY}
        fontSize={M.nameSize}
        fontStyle="italic"
        fill={v.text}
        textAnchor={p.leftAlign ? 'start' : 'middle'}
        fontFamily={brand.fontFamily}
      >
        {`• ${p.node.name}`}
      </text>,
    )
    cursorY += M.nameLineH
  }
  if (p.bulletLines.length) {
    cursorY += 6
    p.bulletLines.forEach((b, i) => {
      extras.push(
        <text
          key={`b${i}`}
          x={contentX + (b.first ? 0 : 12)}
          y={cursorY}
          fontSize={M.bulletSize}
          fill={v.text}
          fontFamily={brand.fontFamily}
        >
          {b.first ? `• ${b.text}` : b.text}
        </text>,
      )
      cursorY += M.bulletLineH
    })
  }

  // Detail rows (white panels under the header).
  const detailEls: JSX.Element[] = []
  let dy = p.y + p.headerH
  p.detailBlocks.forEach((blk, bi) => {
    detailEls.push(
      <rect
        key={`dr${bi}`}
        x={p.x}
        y={dy}
        width={p.w}
        height={blk.h}
        fill={brand.white}
        stroke={brand.detailBorder}
        strokeWidth={1}
      />,
    )
    const label = p.node.details?.[bi]?.label ?? ''
    blk.lines.forEach((line, li) => {
      const isFirst = li === 0 && label
      const bold = isFirst ? line.slice(0, label.length) : ''
      const rest = isFirst ? line.slice(label.length) : line
      detailEls.push(
        <text
          key={`dt${bi}-${li}`}
          x={p.x + M.padX}
          y={dy + M.detailPadY + (li + 1) * M.detailLineH - 3.5}
          fontSize={M.detailSize}
          fill={brand.detailText}
          fontFamily={brand.fontFamily}
        >
          {isFirst ? (
            <>
              <tspan fontWeight={700}>{bold}</tspan>
              {rest}
            </>
          ) : (
            line
          )}
        </text>,
      )
    })
    dy += blk.h
  })

  return (
    <g
      onPointerDown={onPointerDown ? (e) => onPointerDown(p.node.id, e) : undefined}
      onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(p.node.id) } : undefined}
      style={onSelect ? { cursor: onPointerDown ? 'move' : 'pointer' } : undefined}
    >
      <HeaderShape p={p} fill={v.fill} />
      {p.detailBlocks.length > 0 && shape === 'box' && (
        // Square off the header's bottom corners when detail rows attach.
        <rect x={p.x} y={p.y + p.headerH - M.boxRadius} width={p.w} height={M.boxRadius} fill={v.fill} />
      )}
      {detailEls}
      {photo && <PhotoPlaceholder x={p.x + 6} y={p.y + (p.headerH - 30) / 2} />}
      {titleEls}
      {extras}
      {badgeGlyphs(p)}
      {compliance && <ComplianceBadge p={p} status={compliance} />}
      {selected && (
        <rect
          data-ui="selection"
          x={p.x - 3}
          y={p.y - 3}
          width={p.w + 6}
          height={p.totalH + 6}
          rx={M.boxRadius + 2}
          fill="none"
          stroke={brand.marker}
          strokeWidth={2}
          strokeDasharray="5 3"
        />
      )}
    </g>
  )
}

/* Memoized so that during a drag (or selection change) only the boxes whose
 * props actually changed re-render. previewDrag() reuses untouched PlacedNode
 * objects by reference, and the callbacks are stable, so the shallow compare
 * skips every box except the one being moved. */
const MemoNodeBox = memo(NodeBox)

function LegendMarkerGlyph({ marker, x, y }: { marker: LegendMarker; x: number; y: number }) {
  switch (marker) {
    case 'keyGold':
      return <KeyIcon x={x} y={y + 3} color={brand.keyGold} />
    case 'keyGray':
      return <KeyIcon x={x} y={y + 3} color={brand.keyGray} />
    case 'cornerAccent':
      return <path d={`M ${x} ${y} h 14 L ${x} ${y + 14} Z`} fill={brand.marker} />
    case 'boxPrimary':
    case 'boxSecondary':
    case 'boxTertiary':
    case 'boxAccent': {
      const key = marker.slice(3).toLowerCase() // 'primary' | 'secondary' | ...
      return <rect x={x} y={y} width={16} height={14} rx={2} fill={variantFill[key].fill} />
    }
    case 'green':
    case 'blue':
    case 'orange':
      return <rect x={x} y={y} width={16} height={14} fill={zoneFill[marker]} stroke="#BDBDBD" strokeWidth={0.5} />
    case 'dashed':
      return (
        <rect x={x} y={y} width={16} height={14} fill="none" stroke={brand.zoneDash} strokeWidth={1.5} strokeDasharray="4 3" />
      )
    case 'comm':
      return (
        <g stroke={brand.comm} strokeWidth={2}>
          <line x1={x} y1={y + 7} x2={x + 16} y2={y + 7} />
          <path d={`M ${x + 3} ${y + 3} L ${x} ${y + 7} L ${x + 3} ${y + 11}`} fill="none" />
          <path d={`M ${x + 13} ${y + 3} L ${x + 16} ${y + 7} L ${x + 13} ${y + 11}`} fill="none" />
        </g>
      )
  }
}

/** Trim a string with an ellipsis so its rendered width fits `maxW`. */
function truncate(s: string, size: number, maxW: number): string {
  if (textWidth(s, size) <= maxW) return s
  let out = s
  while (out.length > 1 && textWidth(`${out}…`, size) > maxW) out = out.slice(0, -1)
  return `${out}…`
}

/** Coverage + gaps panel, drawn as self-contained SVG under the chart. */
function CompliancePanel({ overlay }: { overlay: ComplianceOverlay }) {
  const { panel: r, coverage, gaps, gapsMore } = overlay
  const pad = 12
  const innerW = r.w - pad * 2
  const barY = r.y + 46
  const covW = Math.round((innerW * coverage.pct) / 100)
  let gy = barY + 26
  return (
    <g fontFamily={brand.fontFamily}>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={6} fill={brand.white} stroke="#BDBDBD" strokeWidth={1} />
      <text x={r.x + pad} y={r.y + 22} fontSize={13} fontWeight={700} fill={brand.heading}>
        {`Compliance Coverage — ${coverage.pct}%`}
      </text>
      <text x={r.x + pad} y={r.y + 38} fontSize={11} fill={brand.detailText}>
        {`${coverage.covered} of ${coverage.total} requirements covered`}
      </text>
      <rect x={r.x + pad} y={barY} width={innerW} height={7} rx={3.5} fill={COMPLY_TRACK} />
      {covW > 0 && <rect x={r.x + pad} y={barY} width={covW} height={7} rx={3.5} fill={COMPLY_OK} />}
      {gaps.length ? (
        <>
          <text x={r.x + pad} y={gy + 8} fontSize={11} fontWeight={700} fill={COMPLY_BAD}>
            {`Gaps (${gaps.length + gapsMore})`}
          </text>
          {gaps.map((g, i) => {
            const yy = gy + 24 + i * 18
            const label = `${REF_KIND_LABEL[g.kind]} ${g.ref}${g.title ? ` — ${g.title}` : ''}`
            return (
              <g key={`${g.kind}-${g.ref}-${i}`}>
                <rect x={r.x + pad} y={yy - 8} width={7} height={7} rx={1.5} fill={COMPLY_BAD} />
                <text x={r.x + pad + 13} y={yy} fontSize={11} fill={brand.detailText}>
                  {truncate(label, 11, innerW - 15)}
                </text>
              </g>
            )
          })}
          {gapsMore > 0 && (
            <text
              x={r.x + pad + 13}
              y={gy + 24 + gaps.length * 18}
              fontSize={10.5}
              fontStyle="italic"
              fill="#8b86a0"
            >
              {`+${gapsMore} more`}
            </text>
          )}
        </>
      ) : (
        <text x={r.x + pad} y={gy + 8} fontSize={11} fontWeight={700} fill={COMPLY_OK}>
          No gaps — every requirement is owned
        </text>
      )}
    </g>
  )
}

/** Action caption beneath the graphic. Rendered as part of the SVG, so it
 *  travels into every export. */
function CaptionText({ caption }: { caption: NonNullable<Layout['caption']> }) {
  return (
    <g>
      {caption.lines.map((ln, i) => (
        <text
          key={i}
          x={caption.x}
          y={caption.y + (i + 1) * 17 - 4}
          fontSize={12}
          fill={brand.detailText}
          fontFamily={brand.fontFamily}
        >
          {ln}
        </text>
      ))}
    </g>
  )
}

/** Classification-marking color, keyed off the banner text. Unknown markings
 *  fall back to a neutral bar. */
function bannerColor(text: string): string {
  const t = text.toLowerCase()
  if (/top\s*secret/.test(t)) return '#FF8C00'
  if (/secret/.test(t)) return '#C8102E'
  if (/confidential/.test(t)) return '#0033A0'
  if (/\bcui\b|controlled unclassified|fouo/.test(t)) return '#502B85'
  if (/unclassified|\bunclass\b/.test(t)) return '#007A33'
  return '#3A3A4E'
}

/** Top + bottom classification / CUI banners. Sit inside the canvas margins, so
 *  no layout offset is needed, and render on top of everything. */
function BannerBars({ text, width, height }: { text: string; width: number; height: number }) {
  const bg = bannerColor(text)
  const fg = readableText(bg)
  const label = text.toUpperCase()
  const h = 18
  const bar = (y: number, key: string) => (
    <g key={key}>
      <rect x={0} y={y} width={width} height={h} fill={bg} />
      <text
        x={width / 2}
        y={y + h / 2 + 3.6}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        letterSpacing="0.6"
        fill={fg}
        fontFamily={brand.fontFamily}
      >
        {label}
      </text>
    </g>
  )
  return (
    <>
      {bar(4, 'top')}
      {bar(height - h - 4, 'bottom')}
    </>
  )
}

/** Transition-schedule (Gantt) renderer. Self-contained SVG: time axis with
 *  quarter-span ticks, dashed phase markers, task bars, and milestone diamonds. */
function TimelineSvg({ layout, ariaLabel, selectedId, onSelect }: DataSvgProps) {
  const tl = layout.timeline!
  const { width, height } = layout
  const pad = M.canvasPad
  const plotRight = tl.plotX + tl.plotW
  const plotBottom = tl.bars.length ? tl.bars[tl.bars.length - 1].y + tl.rowH : tl.top + tl.rowH
  const diamond = (cx: number, cy: number, r: number) =>
    `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily={brand.fontFamily}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id="skyGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brand.skyGradient[0]} />
          <stop offset="50%" stopColor={brand.skyGradient[1]} />
          <stop offset="100%" stopColor={brand.skyGradient[2]} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill={brand.canvasBg} />
      <g transform={`translate(0, ${layout.contentShift})`}>

      {/* Workstream swimlane bands (behind everything). */}
      {tl.bands.map((band, i) => (
        <g key={`band-${i}`}>
          <rect
            x={pad - 6}
            y={band.y}
            width={plotRight - pad + 12}
            height={band.h}
            rx={4}
            fill={band.style === 'dashed' ? '#F1EFFA' : zoneFill[band.style]}
          />
          {band.label && (
            <text
              x={pad}
              y={band.y + 12}
              fontSize={9.5}
              fontWeight={700}
              letterSpacing="0.4"
              fill={brand.heading}
              fontFamily={brand.fontFamily}
            >
              {band.label.toUpperCase()}
            </text>
          )}
        </g>
      ))}

      {/* Quarter-span gridlines + tick labels. */}
      {tl.ticks.map((t, i) => (
        <g key={`tick-${i}`}>
          <line x1={t.x} y1={tl.axisY} x2={t.x} y2={plotBottom} stroke="#E7E7EE" strokeWidth={1} />
          <text x={t.x} y={tl.axisY - 5} textAnchor="middle" fontSize={10.5} fill={brand.detailText}>
            {t.label}
          </text>
        </g>
      ))}

      {/* Axis baseline. */}
      <line x1={tl.plotX} y1={tl.axisY} x2={plotRight} y2={tl.axisY} stroke={brand.line} strokeWidth={1.5} />

      {/* Phase markers (30/60/90-day gates), dashed and labeled above the ticks. */}
      {tl.phases.map((p, i) => (
        <g key={`phase-${i}`}>
          <line x1={p.x} y1={tl.axisY} x2={p.x} y2={plotBottom} stroke={brand.comm} strokeWidth={1.4} strokeDasharray="5 4" />
          <text x={p.x} y={tl.axisY - 19} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={brand.comm}>
            {p.label}
          </text>
        </g>
      ))}

      {/* Task rows: gutter label + bar or milestone diamond. Clicking a row
          selects its task, so the Tasks tab jumps straight to its editor. */}
      {tl.bars.map((b) => {
        const cy = b.y + b.rowH / 2
        const selected = b.node.id === selectedId
        return (
          <g
            key={b.node.id}
            onClick={selectData(onSelect, b.node.id)}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            <rect x={pad - 6} y={b.y} width={plotRight - pad + 12} height={b.rowH} fill="transparent" />
            <text
              x={pad + b.depth * 12}
              y={cy + 4}
              fontSize={12}
              fill={brand.heading}
              fontFamily={brand.fontFamily}
            >
              {truncate(b.label, 12, tl.gutter - b.depth * 12 - 12)}
            </text>
            {b.milestone ? (
              <path d={diamond(b.barX, cy, 7)} fill={brand.keyGold} stroke={brand.white} strokeWidth={1} />
            ) : b.barW > 0 ? (
              <rect x={b.barX} y={b.y + 5} width={b.barW} height={b.rowH - 10} rx={4} fill={b.fill} />
            ) : null}
            {selected && (
              <SelectionOutline x={pad - 6} y={b.y} w={plotRight - pad + 12} h={b.rowH} />
            )}
          </g>
        )
      })}

      <ChartChrome layout={layout} />
      </g>
      <OverlayChrome layout={layout} />
    </svg>
  )
}

/* Status-tint fills for table cells (brand zone tints + a light red). */
const CELL_TINT: Record<string, string> = {
  good: brand.zoneGreen,
  warn: brand.zoneOrange,
  bad: '#FBDAD5',
  info: brand.zoneBlue,
}
const TBL_GRID = '#D8D8E2'
const TBL_ZEBRA = '#F7F7FB'
const TBL_SECTION = '#ECE9F5'

/** Branded data-table renderer (RACI, crosswalks, QASP/SLA, comparisons). */
function TableSvg({ layout, ariaLabel, selectedId, onSelect }: DataSvgProps) {
  const t = layout.table!
  const { width, height } = layout
  const sel = parseSelection(selectedId)
  const padX = 10
  const lineH = 15
  const bodyBottom = t.rows.length ? t.rows[t.rows.length - 1].y + t.rows[t.rows.length - 1].h : t.y + t.headerH
  const anchorFor = (a: 'left' | 'center' | 'right') => (a === 'left' ? 'start' : a === 'right' ? 'end' : 'middle')
  const textX = (x: number, w: number, a: 'left' | 'center' | 'right') =>
    a === 'left' ? x + padX : a === 'right' ? x + w - padX : x + w / 2
  // Baseline for line `li` of `n` lines, vertically centered in a row of height h.
  const lineY = (y: number, h: number, n: number, li: number) => y + (h - n * lineH) / 2 + (li + 1) * lineH - 4
  const header = variantFill.primary

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily={brand.fontFamily}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id="skyGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brand.skyGradient[0]} />
          <stop offset="50%" stopColor={brand.skyGradient[1]} />
          <stop offset="100%" stopColor={brand.skyGradient[2]} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill={brand.canvasBg} />
      <g transform={`translate(0, ${layout.contentShift})`}>

      {/* Header row. Clicking a column header selects that column's editor. */}
      <rect x={t.x} y={t.y} width={t.totalW} height={t.headerH} fill={header.fill} />
      {t.columns.map((c, i) => (
        <g
          key={`h-${i}`}
          onClick={selectData(onSelect, colSelId(i))}
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          <rect x={c.x} y={t.y} width={c.w} height={t.headerH} fill="transparent" />
          {c.headerLines.map((ln, li) => (
            <text
              key={li}
              x={textX(c.x, c.w, c.align)}
              y={lineY(t.y, t.headerH, c.headerLines.length, li)}
              fontSize={12}
              fontWeight={700}
              fill={header.text}
              textAnchor={anchorFor(c.align)}
              fontFamily={brand.fontFamily}
            >
              {ln}
            </text>
          ))}
        </g>
      ))}

      {/* Body rows. Clicking a cell selects it in the Table editor. */}
      {t.rows.map((r, ri) => {
        if (r.header) {
          const lines = r.cells[0]?.lines ?? []
          return (
            <g
              key={`r-${ri}`}
              onClick={selectData(onSelect, cellSelId(ri, 0))}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            >
              <rect x={t.x} y={r.y} width={t.totalW} height={r.h} fill={TBL_SECTION} stroke={TBL_GRID} strokeWidth={0.75} />
              {lines.map((ln, li) => (
                <text
                  key={li}
                  x={t.x + padX}
                  y={lineY(r.y, r.h, lines.length, li)}
                  fontSize={11}
                  fontWeight={700}
                  fill={brand.heading}
                  fontFamily={brand.fontFamily}
                >
                  {ln}
                </text>
              ))}
            </g>
          )
        }
        return (
          <g key={`r-${ri}`}>
            {t.columns.map((c, ci) => {
              const cell = r.cells[ci]
              const fill = cell?.status
                ? CELL_TINT[cell.status]
                : t.zebra && ri % 2 === 1
                  ? TBL_ZEBRA
                  : brand.white
              return (
                <g
                  key={ci}
                  onClick={selectData(onSelect, cellSelId(ri, ci))}
                  style={onSelect ? { cursor: 'pointer' } : undefined}
                >
                  <rect x={c.x} y={r.y} width={c.w} height={r.h} fill={fill} stroke={TBL_GRID} strokeWidth={0.75} />
                  {(cell?.lines ?? []).map((ln, li) => (
                    <text
                      key={li}
                      x={textX(c.x, c.w, c.align)}
                      y={lineY(r.y, r.h, cell.lines.length, li)}
                      fontSize={11}
                      fill={brand.detailText}
                      textAnchor={anchorFor(c.align)}
                      fontFamily={brand.fontFamily}
                    >
                      {ln}
                    </text>
                  ))}
                </g>
              )
            })}
          </g>
        )
      })}

      {/* Outer border. */}
      <rect x={t.x} y={t.y} width={t.totalW} height={bodyBottom - t.y} fill="none" stroke="#BDBDBD" strokeWidth={1} />

      {/* Selection outline over the picked column header or cell. */}
      {sel?.kind === 'col' && t.columns[sel.col] && (
        <SelectionOutline x={t.columns[sel.col].x} y={t.y} w={t.columns[sel.col].w} h={t.headerH} rx={2} />
      )}
      {sel?.kind === 'cell' &&
        t.rows[sel.row] &&
        (t.rows[sel.row].header ? (
          <SelectionOutline x={t.x} y={t.rows[sel.row].y} w={t.totalW} h={t.rows[sel.row].h} rx={2} />
        ) : (
          t.columns[sel.col] && (
            <SelectionOutline
              x={t.columns[sel.col].x}
              y={t.rows[sel.row].y}
              w={t.columns[sel.col].w}
              h={t.rows[sel.row].h}
              rx={2}
            />
          )
        ))}

      <ChartChrome layout={layout} />
      </g>
      <OverlayChrome layout={layout} />
    </svg>
  )
}

/** Stat-strip glyphs: a small brand-locked icon set drawn as strokes, so the
 *  exported SVG stays self-contained (no images). */
function StatGlyph({ icon, x, y }: { icon: string; x: number; y: number }) {
  const c = brand.comm
  const common = { stroke: c, strokeWidth: 1.7, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (icon) {
    case 'people':
      return (
        <g transform={`translate(${x}, ${y})`} {...common}>
          <circle cx={6.5} cy={6} r={3.2} />
          <path d="M 1 17 a 5.5 5.5 0 0 1 11 0" />
          <circle cx={14.5} cy={7} r={2.6} />
          <path d="M 13 17 a 4.6 4.6 0 0 1 6 -4.2" />
        </g>
      )
    case 'clock':
      return (
        <g transform={`translate(${x}, ${y})`} {...common}>
          <circle cx={9} cy={9.5} r={7.5} />
          <path d="M 9 5.5 V 9.5 L 12.5 11.5" />
        </g>
      )
    case 'shield':
      return (
        <g transform={`translate(${x}, ${y})`} {...common}>
          <path d="M 9 1.5 L 15.5 4 V 9 c 0 4.4 -2.8 7 -6.5 8.5 C 5.3 16 2.5 13.4 2.5 9 V 4 Z" />
          <path d="M 6 9 l 2.2 2.2 L 12.5 7" />
        </g>
      )
    case 'star':
      return (
        <g transform={`translate(${x}, ${y})`} {...common}>
          <path d="M 9 1.5 L 11.3 6.4 L 16.6 7 L 12.7 10.7 L 13.8 16 L 9 13.3 L 4.2 16 L 5.3 10.7 L 1.4 7 L 6.7 6.4 Z" />
        </g>
      )
    case 'check':
      return (
        <g transform={`translate(${x}, ${y})`} {...common}>
          <circle cx={9} cy={9.5} r={7.5} />
          <path d="M 5.5 9.7 l 2.4 2.5 L 12.7 7" />
        </g>
      )
    case 'chart':
      return (
        <g transform={`translate(${x}, ${y})`} {...common}>
          <path d="M 2 2 V 17 H 17" />
          <path d="M 5.5 13.5 V 9" />
          <path d="M 9.5 13.5 V 5.5" />
          <path d="M 13.5 13.5 V 7.5" />
        </g>
      )
    case 'globe':
      return (
        <g transform={`translate(${x}, ${y})`} {...common}>
          <circle cx={9} cy={9.5} r={7.5} />
          <ellipse cx={9} cy={9.5} rx={3.4} ry={7.5} />
          <path d="M 1.8 9.5 H 16.2" />
        </g>
      )
    default: // 'award'
      return (
        <g transform={`translate(${x}, ${y})`} {...common}>
          <circle cx={9} cy={7} r={5} />
          <path d="M 6.2 11.2 L 4.8 17 L 9 14.6 L 13.2 17 L 11.8 11.2" />
        </g>
      )
  }
}

/** Win-theme banner strip above the graphic. */
function WinThemeBar({ wt }: { wt: NonNullable<Layout['winTheme']> }) {
  return (
    <g>
      <rect x={wt.x} y={wt.y} width={wt.w} height={wt.h} rx={6} fill={variantFill.primary.fill} />
      <rect x={wt.x} y={wt.y} width={5} height={wt.h} rx={2.5} fill="url(#skyGradient)" />
      {wt.lines.map((ln, i) => (
        <text
          key={i}
          x={wt.x + 18}
          y={wt.y + 11 + (i + 1) * 20 - 6}
          fontSize={14}
          fontWeight={700}
          fill={brand.white}
          fontFamily={brand.fontFamily}
        >
          {ln}
        </text>
      ))}
    </g>
  )
}

/** Icon-based stat strip beneath the graphic. */
function StatStrip({ st }: { st: NonNullable<Layout['stats']> }) {
  return (
    <g fontFamily={brand.fontFamily}>
      {st.tiles.map((t, i) => {
        const iconW = t.icon ? 26 : 0
        return (
          <g key={i}>
            {i > 0 && <line x1={t.x} y1={st.y + 6} x2={t.x} y2={st.y + st.h - 6} stroke="#D8D8E2" strokeWidth={1} />}
            {t.icon && <StatGlyph icon={t.icon} x={t.x + 18} y={st.y + 6} />}
            <text x={t.x + 18 + iconW} y={st.y + 24} fontSize={21} fontWeight={700} fill={brand.comm}>
              {t.value}
            </text>
            <text x={t.x + 18} y={st.y + 44} fontSize={10.5} letterSpacing="0.3" fill={brand.detailText}>
              {t.label.toUpperCase()}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** Customer / PWS pull-quote callout beneath the graphic. */
function QuoteBox({ q }: { q: NonNullable<Layout['quote']> }) {
  return (
    <g fontFamily={brand.fontFamily}>
      <rect x={q.x} y={q.y} width={3.5} height={q.h - 4} rx={1.75} fill={brand.skyGradient[1]} />
      {q.lines.map((ln, i) => (
        <text key={i} x={q.x + 16} y={q.y + (i + 1) * 18 - 4} fontSize={12.5} fontStyle="italic" fill={brand.heading}>
          {ln}
        </text>
      ))}
      {q.source && (
        <text x={q.x + 16} y={q.y + q.lines.length * 18 + 12} fontSize={10.5} fill="#8b86a0">
          {`— ${q.source}`}
        </text>
      )}
    </g>
  )
}

/** Title + accent bar, stats, pull quote, and caption — chrome that lives in
 *  the (win-theme-shifted) content group of every renderer. */
function ChartChrome({ layout }: { layout: Layout }) {
  const { title, caption, stats, quote } = layout
  return (
    <>
      {title && (
        <g>
          <text x={title.x} y={title.y} fontSize={20} fontWeight={700} fill={brand.heading} fontFamily={brand.fontFamily}>
            {title.text.toUpperCase()}
          </text>
          <rect x={title.x} y={title.y + 8} width={title.w} height={4} fill="url(#skyGradient)" />
        </g>
      )}
      {stats && <StatStrip st={stats} />}
      {quote && <QuoteBox q={quote} />}
      {caption && <CaptionText caption={caption} />}
    </>
  )
}

/** Chrome drawn OUTSIDE the shifted content group: the win-theme strip pinned
 *  to the top, and the full-canvas classification banners. */
function OverlayChrome({ layout }: { layout: Layout }) {
  const { winTheme, banner, width, height } = layout
  return (
    <>
      {winTheme && <WinThemeBar wt={winTheme} />}
      {banner && <BannerBars text={banner} width={width} height={height} />}
    </>
  )
}

/** Props shared by the data-layout renderers: clicking an element selects it
 *  (a prefixed data-selection id) so the side panel can jump to its editor. */
interface DataSvgProps {
  layout: Layout
  ariaLabel?: string
  selectedId?: string | null
  onSelect?: (id: string) => void
}

/** Click handler that selects a data element without clearing via the canvas. */
function selectData(onSelect: ((id: string) => void) | undefined, id: string) {
  return onSelect
    ? (e: { stopPropagation: () => void }) => {
        e.stopPropagation()
        onSelect(id)
      }
    : undefined
}

/** Dashed selection outline used by every data layout (same look as boxes). */
function SelectionOutline({ x, y, w, h, rx = 4 }: { x: number; y: number; w: number; h: number; rx?: number }) {
  return (
    <rect
      data-ui="selection"
      x={x}
      y={y}
      width={w}
      height={h}
      rx={rx}
      fill="none"
      stroke={brand.marker}
      strokeWidth={2}
      strokeDasharray="5 3"
      style={{ pointerEvents: 'none' }}
    />
  )
}

/* Risk-marker ink: current markers are Force purple with white text; residual
 * markers are open (white) circles with a Force outline. */
const RISK_MARKER = brand.comm
const RISK_GRID_GAP = 2.5

/** 5×5 risk-cube renderer: tinted matrix cells, axis scales + titles, current
 *  and residual markers with mitigation arrows, and the register panel. */
function RiskSvg({ layout, ariaLabel, selectedId, onSelect }: DataSvgProps) {
  const rc = layout.risk!
  const { width, height } = layout
  const cs = rc.cellSize
  const R = 11 // marker radius
  const sel = parseSelection(selectedId)
  const selectedRiskId = sel?.kind === 'risk' ? sel.id : null
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily={brand.fontFamily}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id="skyGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brand.skyGradient[0]} />
          <stop offset="50%" stopColor={brand.skyGradient[1]} />
          <stop offset="100%" stopColor={brand.skyGradient[2]} />
        </linearGradient>
        <marker id="riskArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M 0 0 L 7 4 L 0 8 Z" fill={RISK_MARKER} />
        </marker>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill={brand.canvasBg} />
      <g transform={`translate(0, ${layout.contentShift})`}>

      {/* Matrix cells (small white gaps read as the grid). */}
      {rc.cells.map((c) => (
        <rect
          key={`${c.row}-${c.col}`}
          x={c.x + RISK_GRID_GAP / 2}
          y={c.y + RISK_GRID_GAP / 2}
          width={cs - RISK_GRID_GAP}
          height={cs - RISK_GRID_GAP}
          rx={3}
          fill={riskFill[c.level]}
        />
      ))}

      {/* Axis scales: consequence 1–5 along the bottom, likelihood 1–5 up the left. */}
      {[1, 2, 3, 4, 5].map((v) => (
        <g key={`ax-${v}`} fontSize={11} fill={brand.detailText}>
          <text x={rc.x + (v - 0.5) * cs} y={rc.y + rc.plotH + 16} textAnchor="middle">
            {v}
          </text>
          <text x={rc.x - 10} y={rc.y + (5 - v + 0.5) * cs + 4} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <text
        x={rc.x + rc.plotW / 2}
        y={rc.y + rc.plotH + 36}
        textAnchor="middle"
        fontSize={11.5}
        fontWeight={700}
        letterSpacing="0.5"
        fill={brand.heading}
      >
        {rc.xLabel.toUpperCase()} →
      </text>
      <text
        x={rc.x - 30}
        y={rc.y + rc.plotH / 2}
        textAnchor="middle"
        fontSize={11.5}
        fontWeight={700}
        letterSpacing="0.5"
        fill={brand.heading}
        transform={`rotate(-90 ${rc.x - 30} ${rc.y + rc.plotH / 2})`}
      >
        {rc.yLabel.toUpperCase()} →
      </text>

      {/* Mitigation arrows first, so markers draw over their ends. */}
      {rc.markers.map(
        (m) =>
          m.residual && (
            <line
              key={`arrow-${m.id}`}
              x1={m.cx}
              y1={m.cy}
              x2={m.residual.cx}
              y2={m.residual.cy}
              stroke={RISK_MARKER}
              strokeWidth={1.8}
              strokeDasharray="5 4"
              markerEnd="url(#riskArrow)"
            />
          ),
      )}

      {/* Residual (post-mitigation) markers: open circles. Clicking one
          selects its risk, same as the current marker. */}
      {rc.markers.map(
        (m) =>
          m.residual && (
            <g
              key={`res-${m.id}`}
              onClick={selectData(onSelect, riskSelId(m.id))}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            >
              <title>{`${m.code} residual: ${m.title}`}</title>
              {m.id === selectedRiskId && (
                <circle
                  cx={m.residual.cx}
                  cy={m.residual.cy}
                  r={R + 2.5}
                  fill="none"
                  stroke={brand.marker}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              <circle cx={m.residual.cx} cy={m.residual.cy} r={R - 1.5} fill={brand.white} stroke={RISK_MARKER} strokeWidth={1.8} />
              <text
                x={m.residual.cx}
                y={m.residual.cy + 3.5}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={700}
                fill={RISK_MARKER}
              >
                {m.code}
              </text>
            </g>
          ),
      )}

      {/* Current markers. Clicking one selects the risk in the register. */}
      {rc.markers.map((m) => (
        <g
          key={`cur-${m.id}`}
          onClick={selectData(onSelect, riskSelId(m.id))}
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          <title>{`${m.code}: ${m.title}`}</title>
          {m.id === selectedRiskId && (
            <circle
              cx={m.cx}
              cy={m.cy}
              r={R + 4}
              fill="none"
              stroke={brand.marker}
              strokeWidth={2}
              strokeDasharray="4 3"
              style={{ pointerEvents: 'none' }}
            />
          )}
          <circle cx={m.cx} cy={m.cy} r={R} fill={RISK_MARKER} stroke={brand.white} strokeWidth={1.5} />
          <text x={m.cx} y={m.cy + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={brand.white}>
            {m.code}
          </text>
        </g>
      ))}

      {/* Register panel. */}
      {rc.panel && (
        <g>
          <rect x={rc.panel.x} y={rc.panel.y} width={rc.panel.w} height={rc.panel.h} rx={4} fill={brand.white} stroke="#BDBDBD" strokeWidth={1} />
          <text x={rc.panel.x + 12} y={rc.panel.y + 20} fontSize={12} fontWeight={700} fill={brand.heading}>
            Risk Register
          </text>
          {rc.panel.rows.map((row, i) => {
            const moveW = textWidth(row.move, 10.5)
            const titleMax = rc.panel!.w - 24 - 14 - textWidth(`${row.code}  `, 11, true) - moveW - 10
            return (
              <g
                key={`${row.code}-${i}`}
                onClick={selectData(onSelect, riskSelId(row.id))}
                style={onSelect ? { cursor: 'pointer' } : undefined}
              >
                <rect x={rc.panel!.x + 4} y={row.y - 14} width={rc.panel!.w - 8} height={20} rx={3} fill="transparent" />
                {row.id === selectedRiskId && (
                  <SelectionOutline x={rc.panel!.x + 4} y={row.y - 14} w={rc.panel!.w - 8} h={20} rx={3} />
                )}
                <circle cx={rc.panel!.x + 17} cy={row.y - 3.5} r={4.5} fill={riskFill[row.level]} stroke="#BDBDBD" strokeWidth={0.5} />
                <text x={rc.panel!.x + 27} y={row.y} fontSize={11} fill={brand.detailText}>
                  <tspan fontWeight={700}>{row.code}</tspan>
                  {`  ${truncate(row.title, 11, Math.max(30, titleMax))}`}
                </text>
                <text x={rc.panel!.x + rc.panel!.w - 12} y={row.y} textAnchor="end" fontSize={10.5} fill="#8b86a0">
                  {row.move}
                </text>
              </g>
            )
          })}
        </g>
      )}

      <ChartChrome layout={layout} />
      </g>
      <OverlayChrome layout={layout} />
    </svg>
  )
}

const XY_GRID = '#E7E7EE'
const XY_AREA_OPACITY = 0.24

/** Legend swatch for an xy series, shaped by its kind. */
function XYLegendSwatch({ kind, fill, x, y }: { kind: string; fill: string; x: number; y: number }) {
  if (kind === 'bar') return <rect x={x} y={y - 9} width={10} height={11} rx={1.5} fill={fill} />
  if (kind === 'area')
    return (
      <g>
        <rect x={x} y={y - 8} width={14} height={9} fill={fill} opacity={XY_AREA_OPACITY} />
        <line x1={x} y1={y - 8} x2={x + 14} y2={y - 8} stroke={fill} strokeWidth={2.2} />
      </g>
    )
  return <line x1={x} y1={y - 4} x2={x + 14} y2={y - 4} stroke={fill} strokeWidth={2.6} strokeLinecap="round" />
}

/** X-Y chart renderer: gridlines, axes, then area → bar → line → dot passes so
 *  overlapping series stay readable. */
function XYSvg({ layout, ariaLabel, selectedId, onSelect }: DataSvgProps) {
  const xc = layout.xy!
  const { width, height } = layout
  const plotBottom = xc.y + xc.plotH
  const sel = parseSelection(selectedId)
  const selectedSeriesId = sel?.kind === 'series' ? sel.id : null
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily={brand.fontFamily}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id="skyGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brand.skyGradient[0]} />
          <stop offset="50%" stopColor={brand.skyGradient[1]} />
          <stop offset="100%" stopColor={brand.skyGradient[2]} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill={brand.canvasBg} />
      <g transform={`translate(0, ${layout.contentShift})`}>

      {/* Horizontal gridlines + y tick labels. */}
      {xc.yTicks.map((t, i) => (
        <g key={`gy-${i}`}>
          <line x1={xc.x} y1={t.y} x2={xc.x + xc.plotW} y2={t.y} stroke={XY_GRID} strokeWidth={1} />
          <text x={xc.x - 8} y={t.y + 3.5} textAnchor="end" fontSize={10.5} fill={brand.detailText}>
            {t.label}
          </text>
        </g>
      ))}

      {/* X tick marks + labels. */}
      {xc.xTicks.map((t, i) => (
        <g key={`gx-${i}`}>
          <line x1={t.x} y1={plotBottom} x2={t.x} y2={plotBottom + 4} stroke={brand.line} strokeWidth={1.2} />
          <text x={t.x} y={plotBottom + 16} textAnchor="middle" fontSize={10.5} fill={brand.detailText}>
            {t.label}
          </text>
        </g>
      ))}

      {/* Axis frame: left edge + zero baseline. */}
      <line x1={xc.x} y1={xc.y} x2={xc.x} y2={plotBottom} stroke={brand.line} strokeWidth={1.5} />
      <line x1={xc.x} y1={plotBottom} x2={xc.x + xc.plotW} y2={plotBottom} stroke={brand.line} strokeWidth={1.5} />
      {xc.zeroY < plotBottom - 0.5 && (
        <line x1={xc.x} y1={xc.zeroY} x2={xc.x + xc.plotW} y2={xc.zeroY} stroke={brand.heading} strokeWidth={1} />
      )}

      {/* Areas first (translucent), then bars, lines, and marker dots.
          Clicking any mark selects its series in the Data editor. */}
      {xc.series.map(
        (s) =>
          s.areaPath && (
            <path
              key={`a-${s.id}`}
              d={s.areaPath}
              fill={s.fill}
              opacity={XY_AREA_OPACITY}
              onClick={selectData(onSelect, seriesSelId(s.id))}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            />
          ),
      )}
      {xc.series.map((s) =>
        s.bars ? (
          <g
            key={`b-${s.id}`}
            onClick={selectData(onSelect, seriesSelId(s.id))}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            {s.bars.map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill={s.fill}>
                <title>{s.label}</title>
              </rect>
            ))}
            {s.id === selectedSeriesId &&
              s.bars.map((b, i) => (
                <SelectionOutline key={`sel-${i}`} x={b.x - 2} y={b.y - 2} w={b.w + 4} h={b.h + 4} rx={3} />
              ))}
          </g>
        ) : null,
      )}
      {xc.series.map(
        (s) =>
          s.linePath && (
            <g
              key={`l-${s.id}`}
              onClick={selectData(onSelect, seriesSelId(s.id))}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            >
              {s.id === selectedSeriesId && (
                <path d={s.linePath} fill="none" stroke={s.fill} strokeWidth={9} opacity={0.22} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {/* Wide invisible stroke so thin lines are easy to click. */}
              <path d={s.linePath} fill="none" stroke="transparent" strokeWidth={12} />
              <path
                d={s.linePath}
                fill="none"
                stroke={s.fill}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ),
      )}
      {xc.series.map((s) =>
        s.kind === 'bar' ? null : (
          <g
            key={`d-${s.id}`}
            onClick={selectData(onSelect, seriesSelId(s.id))}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            {s.dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={3} fill={s.fill} stroke={brand.white} strokeWidth={1.2}>
                <title>{s.label}</title>
              </circle>
            ))}
          </g>
        ),
      )}

      {/* Series legend (above the plot); clicking an entry selects its series. */}
      {xc.legend.map((item, i) => {
        const w = 20 + textWidth(item.label, 11)
        return (
          <g
            key={`leg-${i}`}
            onClick={selectData(onSelect, seriesSelId(item.id))}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            <rect x={item.x - 4} y={item.y - 13} width={w + 8} height={18} rx={3} fill="transparent" />
            {item.id === selectedSeriesId && (
              <SelectionOutline x={item.x - 4} y={item.y - 13} w={w + 8} h={18} rx={3} />
            )}
            <XYLegendSwatch kind={item.kind} fill={item.fill} x={item.x} y={item.y} />
            <text x={item.x + 20} y={item.y} fontSize={11} fill={brand.detailText}>
              {item.label}
            </text>
          </g>
        )
      })}

      {/* Axis titles. */}
      {xc.xLabel && (
        <text
          x={xc.x + xc.plotW / 2}
          y={plotBottom + 36}
          textAnchor="middle"
          fontSize={11.5}
          fontWeight={700}
          letterSpacing="0.5"
          fill={brand.heading}
        >
          {xc.xLabel.toUpperCase()}
        </text>
      )}
      {xc.yLabel && (
        <text
          x={M.canvasPad + 10}
          y={xc.y + xc.plotH / 2}
          textAnchor="middle"
          fontSize={11.5}
          fontWeight={700}
          letterSpacing="0.5"
          fill={brand.heading}
          transform={`rotate(-90 ${M.canvasPad + 10} ${xc.y + xc.plotH / 2})`}
        >
          {xc.yLabel.toUpperCase()}
        </text>
      )}

      <ChartChrome layout={layout} />
      </g>
      <OverlayChrome layout={layout} />
    </svg>
  )
}

/** Flow renderer for the cycle / pipeline / stack layouts: pre-computed step
 *  shapes with centered titles, per-mode detail text, and click-to-select. */
function FlowSvg({ layout, ariaLabel, selectedId, onSelect }: DataSvgProps) {
  const fl = layout.flow!
  const { width, height } = layout
  const sel = parseSelection(selectedId)
  const selectedStepId = sel?.kind === 'step' ? sel.id : null
  const titleLH = fl.kind === 'stack' ? 19 : fl.kind === 'pipeline' ? 17 : 16
  const titleSize = fl.kind === 'stack' ? 14 : fl.kind === 'pipeline' ? 13 : 12.5
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily={brand.fontFamily}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id="skyGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brand.skyGradient[0]} />
          <stop offset="50%" stopColor={brand.skyGradient[1]} />
          <stop offset="100%" stopColor={brand.skyGradient[2]} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill={brand.canvasBg} />
      <g transform={`translate(0, ${layout.contentShift})`}>

      {fl.steps.map((s) => (
        <g
          key={s.id}
          onClick={selectData(onSelect, stepSelId(s.id))}
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          <path d={s.path} fill={s.fill} />
          {s.id === selectedStepId && (
            <path
              d={s.path}
              fill="none"
              stroke={brand.marker}
              strokeWidth={2.5}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {s.titleLines.map((ln, i) => (
            <text
              key={i}
              x={s.labelX}
              y={s.labelY + (i - (s.titleLines.length - 1) / 2) * titleLH + titleSize / 3}
              textAnchor="middle"
              fontSize={titleSize}
              fontWeight={700}
              fill={s.text}
            >
              {ln}
            </text>
          ))}
          {s.detail &&
            s.detail.lines.map((ln, i) => (
              <text
                key={`d${i}`}
                x={s.detail!.x}
                y={s.detail!.y + i * 14}
                textAnchor={s.detail!.anchor}
                fontSize={10.5}
                fill={brand.detailText}
              >
                {ln}
              </text>
            ))}
        </g>
      ))}

      {fl.hub &&
        fl.hub.lines.map((ln, i) => (
          <text
            key={`hub${i}`}
            x={fl.hub!.x}
            y={fl.hub!.y + (i - (fl.hub!.lines.length - 1) / 2) * 18 + 4.5}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            letterSpacing="0.4"
            fill={brand.heading}
          >
            {ln.toUpperCase()}
          </text>
        ))}

      <ChartChrome layout={layout} />
      </g>
      <OverlayChrome layout={layout} />
    </svg>
  )
}

export function ChartSvg({ layout, selectedId, onSelect, onNodePointerDown, ariaLabel }: Props) {
  const dataProps = { layout, ariaLabel, selectedId, onSelect }
  if (layout.timeline) return <TimelineSvg {...dataProps} />
  if (layout.table) return <TableSvg {...dataProps} />
  if (layout.risk) return <RiskSvg {...dataProps} />
  if (layout.xy) return <XYSvg {...dataProps} />
  if (layout.flow) return <FlowSvg {...dataProps} />
  const { placed, connectors, zones, comms, legend, compliance, width, height } = layout
  const orphanSet = compliance ? new Set(compliance.orphanNodeIds) : null
  const statusFor = (p: PlacedNode): 'ok' | 'orphan' | null => {
    if (!compliance || !(p.node.refs?.length)) return null
    return orphanSet!.has(p.node.id) ? 'orphan' : 'ok'
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily={brand.fontFamily}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <marker id="commArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto-start-reverse">
          <path d="M 0 0 L 7 4 L 0 8 Z" fill={brand.comm} />
        </marker>
        <linearGradient id="skyGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brand.skyGradient[0]} />
          <stop offset="50%" stopColor={brand.skyGradient[1]} />
          <stop offset="100%" stopColor={brand.skyGradient[2]} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill={brand.canvasBg} />
      <g transform={`translate(0, ${layout.contentShift})`}>

      {zones.map((z) =>
        z.group.style === 'dashed' ? (
          <g key={z.group.id}>
            <rect
              x={z.rect.x}
              y={z.rect.y}
              width={z.rect.w}
              height={z.rect.h}
              fill="rgba(29,79,145,0.03)"
              stroke={brand.zoneDash}
              strokeWidth={1.6}
              strokeDasharray="7 5"
              rx={4}
            />
            {z.group.label && (
              <text
                x={z.rect.x + 10}
                y={z.rect.y + 18}
                fontSize={13}
                fontWeight={700}
                fill={brand.zoneDash}
                fontFamily={brand.fontFamily}
              >
                {z.group.label}
              </text>
            )}
          </g>
        ) : (
          <g key={z.group.id}>
            <rect
              x={z.rect.x}
              y={z.rect.y}
              width={z.rect.w}
              height={z.rect.h}
              fill={zoneFill[z.group.style]}
              rx={6}
            />
            {z.group.label && (
              <text
                x={z.rect.x + 10}
                y={z.rect.y + z.rect.h - 8}
                fontSize={12}
                fontWeight={700}
                fill={brand.heading}
                fontFamily={brand.fontFamily}
              >
                {z.group.label}
              </text>
            )}
          </g>
        ),
      )}

      <g stroke={brand.line} strokeWidth={2.4} fill="none">
        {connectors.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {/* Edges render under the boxes so long runs stay tidy; the arrowheads at
          box edges remain visible. Each edge carries its own style + arrows. */}
      <g stroke={brand.comm} strokeWidth={2} fill="none">
        {comms.map((c) => {
          const arrow = edgeArrow(c.link)
          return (
            <path
              key={c.link.id}
              d={c.path}
              strokeDasharray={c.link.style === 'dashed' ? '6 4' : undefined}
              markerEnd={arrow === 'end' || arrow === 'both' ? 'url(#commArrow)' : undefined}
              markerStart={arrow === 'start' || arrow === 'both' ? 'url(#commArrow)' : undefined}
            />
          )
        })}
      </g>

      {/* Edge labels: a small white plate so the text reads over any lines. */}
      {comms.map((c) => {
        if (!c.link.label) return null
        const lw = textWidth(c.link.label, 10.5)
        return (
          <g key={`${c.link.id}-label`}>
            <rect
              x={c.labelPos.x - lw / 2 - 4}
              y={c.labelPos.y - 9}
              width={lw + 8}
              height={17}
              rx={3}
              fill={brand.white}
              stroke={brand.detailBorder}
              strokeWidth={0.75}
            />
            <text
              x={c.labelPos.x}
              y={c.labelPos.y + 3.5}
              textAnchor="middle"
              fontSize={10.5}
              fill={brand.comm}
              fontFamily={brand.fontFamily}
            >
              {c.link.label}
            </text>
          </g>
        )
      })}

      {placed.map((p) => (
        <MemoNodeBox
          key={p.node.id}
          p={p}
          selected={p.node.id === selectedId}
          compliance={statusFor(p)}
          onSelect={onSelect}
          onPointerDown={onNodePointerDown}
        />
      ))}

      {compliance && <CompliancePanel overlay={compliance} />}

      {legend && (
        <g>
          <rect
            x={legend.x}
            y={legend.y}
            width={legend.w}
            height={legend.h}
            fill={brand.white}
            stroke="#BDBDBD"
            strokeWidth={1}
            rx={4}
          />
          <text
            x={legend.x + 12}
            y={legend.y + 20}
            fontSize={12}
            fontWeight={700}
            fill={brand.heading}
            fontFamily={brand.fontFamily}
          >
            Legend
          </text>
          {legend.items.map((item, i) => {
            const iy = legend.y + 32 + i * 24
            return (
              <g key={item.id}>
                <LegendMarkerGlyph marker={item.marker} x={legend.x + 12} y={iy} />
                <text
                  x={legend.x + 36}
                  y={iy + 11}
                  fontSize={11}
                  fill={brand.detailText}
                  fontFamily={brand.fontFamily}
                >
                  {item.label}
                </text>
              </g>
            )
          })}
        </g>
      )}

      <ChartChrome layout={layout} />
      </g>
      <OverlayChrome layout={layout} />
    </svg>
  )
}
