import { memo } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'
import { textWidth } from './layout'
import type { ComplianceOverlay, Layout, PlacedNode } from './layout'
import { REF_KIND_LABEL } from './compliance'
import { edgeArrow } from './model'
import type { BadgeType, LegendMarker } from './model'
import { brand, metrics as M, readableText, variantFill, zoneFill } from './theme'

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

  let ty = p.y + M.padY + M.titleLineH - 5
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
      <rect
        x={p.x}
        y={p.y}
        width={p.w}
        height={p.headerH}
        rx={M.boxRadius}
        fill={v.fill}
      />
      {p.detailBlocks.length > 0 && (
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

/** Transition-schedule (Gantt) renderer. Self-contained SVG: time axis with
 *  quarter-span ticks, dashed phase markers, task bars, and milestone diamonds. */
function TimelineSvg({ layout, ariaLabel }: { layout: Layout; ariaLabel?: string }) {
  const tl = layout.timeline!
  const { width, height, title } = layout
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

      {/* Task rows: gutter label + bar or milestone diamond. */}
      {tl.bars.map((b) => {
        const cy = b.y + b.rowH / 2
        return (
          <g key={b.node.id}>
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
          </g>
        )
      })}

      {title && (
        <g>
          <text x={title.x} y={title.y} fontSize={20} fontWeight={700} fill={brand.heading} fontFamily={brand.fontFamily}>
            {title.text.toUpperCase()}
          </text>
          <rect x={title.x} y={title.y + 8} width={title.w} height={4} fill="url(#skyGradient)" />
        </g>
      )}
      {layout.caption && <CaptionText caption={layout.caption} />}
    </svg>
  )
}

export function ChartSvg({ layout, selectedId, onSelect, onNodePointerDown, ariaLabel }: Props) {
  if (layout.timeline) return <TimelineSvg layout={layout} ariaLabel={ariaLabel} />
  const { placed, connectors, zones, comms, legend, title, compliance, caption, width, height } = layout
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

      {title && (
        <g>
          {/* Headlines are all-caps per the Astrion brand standards. */}
          <text
            x={title.x}
            y={title.y}
            fontSize={20}
            fontWeight={700}
            fill={brand.heading}
            fontFamily={brand.fontFamily}
          >
            {title.text.toUpperCase()}
          </text>
          {/* Sky-gradient bar (Refraction first, per the brand standards),
              sized to match the headline width above it. */}
          <rect x={title.x} y={title.y + 8} width={title.w} height={4} fill="url(#skyGradient)" />
        </g>
      )}
      {caption && <CaptionText caption={caption} />}
    </svg>
  )
}
