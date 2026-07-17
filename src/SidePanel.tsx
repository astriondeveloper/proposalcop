import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type {
  BadgeType,
  CellStatus,
  CommLink,
  Direction,
  EdgeArrow,
  EdgeStyle,
  LayoutMode,
  LegendMarker,
  OrgChart,
  OrgNode,
  RefKind,
  Requirement,
  RiskCube,
  RiskItem,
  SchedulePhase,
  TableDef,
  Variant,
  XYChart,
  XYPoint,
  XYSeries,
  XYSeriesKind,
} from './model'
import {
  addChild,
  addRoot,
  addSibling,
  allNodes,
  autoLegend,
  clone,
  deleteNode,
  edgeArrow,
  emptyTable,
  findNode,
  moveNode,
  normalizeChart,
  parsePoints,
  REF_KINDS,
  riskLevel,
  setNodePos,
  tableAddColumn,
  tableAddRow,
  tableMoveColumn,
  tableMoveRow,
  tableRemoveColumn,
  tableRemoveRow,
  uid,
  updateNode,
} from './model'
import {
  buildComplianceCsv,
  buildTraceabilityCsv,
  computeCompliance,
  normalizeRef,
  parseRequirements,
  refsFromDetails,
  REF_KIND_LABEL,
} from './compliance'
import { exportCsv, exportLibraryPack } from './export'
import { workshareRollup } from './teaming'
import {
  entryFromChart,
  type LibraryEntry,
  makePack,
  mergeLibrary,
  normalizeLibrary,
} from './library'
import { palette } from './theme'
import type { ZoneStyle } from './theme'

interface Props {
  chart: OrgChart
  onChange: (next: OrgChart) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
}

const VARIANTS: { value: Variant; label: string }[] = [
  { value: 'primary', label: 'Primary (Astrion Force purple)' },
  { value: 'secondary', label: 'Secondary (Astrion Sky blue)' },
  { value: 'tertiary', label: 'Tertiary (Daylight light blue)' },
  { value: 'accent', label: 'Accent (Supernova orange)' },
  { value: 'hidden', label: 'Invisible container' },
]

const BADGES: { value: BadgeType; label: string }[] = [
  { value: 'keyGold', label: 'Gold key (RFP Required)' },
  { value: 'keyGray', label: 'Gray key (Company Designated)' },
  { value: 'cornerAccent', label: 'Corner marker (Twilight)' },
]

const MARKERS: { value: LegendMarker; label: string }[] = [
  { value: 'keyGold', label: 'Gold key' },
  { value: 'keyGray', label: 'Gray key' },
  { value: 'cornerAccent', label: 'Corner marker' },
  { value: 'boxPrimary', label: 'Force (purple) box' },
  { value: 'boxSecondary', label: 'Sky (blue) box' },
  { value: 'boxTertiary', label: 'Daylight (light blue) box' },
  { value: 'boxAccent', label: 'Supernova (orange) box' },
  { value: 'green', label: 'Green zone' },
  { value: 'blue', label: 'Blue zone' },
  { value: 'orange', label: 'Orange zone' },
  { value: 'dashed', label: 'Dashed container' },
  { value: 'comm', label: 'Comm arrow' },
]

const LAYOUT_MODES: { value: LayoutMode; label: string }[] = [
  { value: 'tree', label: 'Tree (hierarchy)' },
  { value: 'radial', label: 'Radial (rings)' },
  { value: 'layered', label: 'Layered (ranked rows)' },
  { value: 'matrix', label: 'Matrix (grid by group)' },
  { value: 'swimlane', label: 'Swimlane (lanes by group)' },
  { value: 'timeline', label: 'Timeline (transition schedule)' },
  { value: 'table', label: 'Table (RACI, crosswalk, QASP…)' },
  { value: 'risk', label: 'Risk Cube (5×5 heatmap)' },
  { value: 'xy', label: 'XY Chart (line / area / bar)' },
]

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'TB', label: 'Top-down ↓' },
  { value: 'BT', label: 'Bottom-up ↑' },
  { value: 'LR', label: 'Left-right →' },
  { value: 'RL', label: 'Right-left ←' },
]

const EDGE_STYLES: { value: EdgeStyle; label: string }[] = [
  { value: 'solid', label: 'Solid line' },
  { value: 'dashed', label: 'Dashed line' },
]

const EDGE_ARROWS: { value: EdgeArrow; label: string }[] = [
  { value: 'both', label: 'Arrows: both ⇄' },
  { value: 'end', label: 'Arrow: to → ' },
  { value: 'start', label: 'Arrow: from ←' },
  { value: 'none', label: 'Arrows: none' },
]

const ZONE_STYLES: { value: ZoneStyle; label: string }[] = [
  { value: 'green', label: 'Tint — green' },
  { value: 'blue', label: 'Tint — blue' },
  { value: 'orange', label: 'Tint — orange' },
  { value: 'dashed', label: 'Dashed container' },
]

/**
 * Every Astrion brand color, derived straight from the palette so the picker is
 * always the complete brand set and never drifts. Off-brand colors are not
 * offered — the per-box color override is restricted to these values.
 */
const COLOR_SWATCHES: { label: string; color: string }[] = Object.entries(palette).map(
  ([key, color]) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), color }),
)

function NodeTree({ chart, selectedId, onSelect }: Omit<Props, 'onChange'>) {
  const rows = allNodes(chart)
  const treeRef = useRef<HTMLDivElement>(null)
  const selIdx = rows.findIndex((r) => r.node.id === selectedId)
  // Roving tabindex: exactly one row is tabbable, and arrow keys move focus.
  const [focusIdx, setFocusIdx] = useState(0)
  // Clamp so a row stays tabbable even after the tree shrinks (e.g. a delete).
  const activeIdx = Math.min(focusIdx, rows.length - 1)

  // Track the current selection as the roving-focus row.
  useEffect(() => {
    if (selIdx >= 0) setFocusIdx(selIdx)
  }, [selIdx])

  // When the selection changes (e.g. a box was clicked in the chart), reveal
  // its row in the tree so the left side always tracks the current node.
  useEffect(() => {
    if (!selectedId) return
    const el = treeRef.current?.querySelector('.tree-row.selected')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const focusRow = (i: number) => {
    const clamped = Math.max(0, Math.min(rows.length - 1, i))
    setFocusIdx(clamped)
    treeRef.current?.querySelectorAll<HTMLButtonElement>('.tree-row')[clamped]?.focus()
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') focusRow(focusIdx + 1)
    else if (e.key === 'ArrowUp') focusRow(focusIdx - 1)
    else if (e.key === 'Home') focusRow(0)
    else if (e.key === 'End') focusRow(rows.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div className="tree" role="tree" aria-label="Chart boxes" ref={treeRef} onKeyDown={onKeyDown}>
      {rows.map(({ node, depth }, i) => (
        <button
          key={node.id}
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={node.id === selectedId}
          className={`tree-row${node.id === selectedId ? ' selected' : ''}`}
          tabIndex={i === activeIdx ? 0 : -1}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => { setFocusIdx(i); onSelect(node.id) }}
        >
          <span
            className={`dot dot-${node.variant}`}
            style={node.color ? { background: node.color, border: 'none' } : undefined}
          />
          <span className="tree-title">{node.title || '(untitled)'}</span>
        </button>
      ))}
    </div>
  )
}

function NodeEditor({ chart, onChange, selectedId, onSelect }: Props) {
  const node = selectedId ? findNode(chart, selectedId) : null
  if (!node) return <p className="hint">Select a box in the chart or tree to edit it.</p>

  const patch = (p: Partial<OrgNode>) => onChange(updateNode(chart, node.id, p))
  const toggleBadge = (b: BadgeType) => {
    const badges = node.badges ?? []
    patch({ badges: badges.includes(b) ? badges.filter((x) => x !== b) : [...badges, b] })
  }

  return (
    <div className="editor">
      <div className="btn-row">
        <button onClick={() => { const r = addChild(chart, node.id); onChange(r.chart); onSelect(r.newId) }}>+ Child</button>
        <button onClick={() => { const r = addSibling(chart, node.id); onChange(r.chart); onSelect(r.newId) }}>+ Sibling</button>
        <button onClick={() => onChange(moveNode(chart, node.id, -1))}>↑</button>
        <button onClick={() => onChange(moveNode(chart, node.id, 1))}>↓</button>
        <button className="danger" onClick={() => { onChange(deleteNode(chart, node.id)); onSelect(null) }}>Delete</button>
      </div>

      <label>Title
        <input value={node.title} onChange={(e) => patch({ title: e.target.value })} />
      </label>
      <label>Person name (italic)
        <input value={node.name ?? ''} onChange={(e) => patch({ name: e.target.value || undefined })} />
      </label>
      <div className="two-col">
        <label>Style
          <select value={node.variant} onChange={(e) => patch({ variant: e.target.value as Variant })}>
            {VARIANTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </label>
        <label>Children layout
          <select value={node.childLayout ?? 'row'} onChange={(e) => patch({ childLayout: e.target.value as 'row' | 'stack' })}>
            <option value="row">Side by side</option>
            <option value="stack">Stacked list</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Box color (Astrion brand)</legend>
        <div className="swatches">
          {COLOR_SWATCHES.map(({ label, color }) => (
            <button
              key={color}
              type="button"
              title={`${label} ${color}`}
              className={`swatch-btn${node.color === color ? ' active' : ''}`}
              style={{ background: color }}
              onClick={() => patch({ color })}
            />
          ))}
        </div>
        <button className="sm" disabled={!node.color} onClick={() => patch({ color: undefined })}>
          Use style color
        </button>
        <p className="hint">
          Brand colors only. Overrides the Style color for this box; the text color adjusts
          automatically for contrast. Clear it to fall back to the Style color.
        </p>
      </fieldset>

      <div className="two-col">
        <label>Width (px, blank = auto)
          <input
            type="number"
            value={node.width ?? ''}
            placeholder="190"
            onChange={(e) => patch({ width: e.target.value ? Math.max(80, Number(e.target.value)) : undefined })}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={!!node.photo} onChange={(e) => patch({ photo: e.target.checked || undefined })} />
          Photo placeholder
        </label>
      </div>

      {node.pos && (
        <div className="btn-row">
          <button className="sm" onClick={() => onChange(setNodePos(chart, node.id, null))}>
            ⤺ Reset to auto position
          </button>
          <span className="hint">Manually placed. Drag boxes on the canvas to reposition.</span>
        </div>
      )}

      <fieldset>
        <legend>Badges</legend>
        {BADGES.map((b) => (
          <label key={b.value} className="check">
            <input
              type="checkbox"
              checked={(node.badges ?? []).includes(b.value)}
              onChange={() => toggleBadge(b.value)}
            />
            {b.label}
          </label>
        ))}
      </fieldset>

      <label>Bullets (one per line)
        <textarea
          rows={4}
          value={(node.bullets ?? []).join('\n')}
          onChange={(e) =>
            patch({ bullets: e.target.value ? e.target.value.split('\n').filter((s) => s.trim()) : undefined })
          }
        />
      </label>

      <fieldset>
        <legend>Detail rows (PWS / Deliverables / Interface)</legend>
        {(node.details ?? []).map((d, i) => (
          <div key={i} className="detail-row">
            <input
              className="detail-label"
              value={d.label}
              placeholder="PWS:"
              onChange={(e) => {
                const details = clone(node.details ?? [])
                details[i] = { ...details[i], label: e.target.value }
                patch({ details })
              }}
            />
            <input
              className="detail-text"
              value={d.text}
              placeholder="3.1 – 3.3"
              onChange={(e) => {
                const details = clone(node.details ?? [])
                details[i] = { ...details[i], text: e.target.value }
                patch({ details })
              }}
            />
            <button
              className="danger sm"
              onClick={() => patch({ details: (node.details ?? []).filter((_, j) => j !== i) })}
            >×</button>
          </div>
        ))}
        <button onClick={() => patch({ details: [...(node.details ?? []), { label: 'PWS:', text: '' }] })}>
          + Detail row
        </button>
      </fieldset>

      <fieldset>
        <legend>Schedule (timeline layout)</legend>
        <div className="two-col">
          <label>Start
            <input
              type="number"
              value={node.start ?? ''}
              placeholder="0"
              onChange={(e) => patch({ start: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
            />
          </label>
          <label>Duration
            <input
              type="number"
              value={node.duration ?? ''}
              placeholder="0"
              onChange={(e) => patch({ duration: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
            />
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={!!node.milestone}
            onChange={(e) => patch({ milestone: e.target.checked || undefined })}
          />
          Milestone (diamond marker)
        </label>
        <p className="hint">Used by the Timeline layout; units match the schedule (days by default).</p>
      </fieldset>

      <fieldset>
        <legend>References (compliance)</legend>
        {(node.refs ?? []).map((r, i) => (
          <div key={i} className="detail-row">
            <select
              className="detail-label"
              aria-label="Reference kind"
              value={r.kind}
              onChange={(e) => {
                const refs = clone(node.refs ?? [])
                refs[i] = { ...refs[i], kind: e.target.value as RefKind }
                patch({ refs })
              }}
            >
              {REF_KINDS.map((k) => <option key={k} value={k}>{REF_KIND_LABEL[k]}</option>)}
            </select>
            <input
              className="detail-text"
              value={r.ref}
              placeholder="3.2.1"
              onChange={(e) => {
                const refs = clone(node.refs ?? [])
                refs[i] = { ...refs[i], ref: e.target.value }
                patch({ refs })
              }}
            />
            <button
              className="danger sm"
              aria-label="Remove reference"
              onClick={() => patch({ refs: (node.refs ?? []).filter((_, j) => j !== i) })}
            >×</button>
          </div>
        ))}
        <div className="btn-row">
          <button onClick={() => patch({ refs: [...(node.refs ?? []), { kind: 'PWS', ref: '' }] })}>
            + Reference
          </button>
          <button
            className="sm"
            title="Create references from this box's PWS / SOW / CDRL detail rows"
            onClick={() => {
              const existing = new Set((node.refs ?? []).map((r) => `${r.kind} ${normalizeRef(r.ref)}`))
              const merged = [...(node.refs ?? [])]
              for (const r of refsFromDetails(node)) {
                const key = `${r.kind} ${normalizeRef(r.ref)}`
                if (!existing.has(key)) {
                  existing.add(key)
                  merged.push(r)
                }
              }
              patch({ refs: merged })
            }}
          >
            Pull from detail rows
          </button>
        </div>
        <p className="hint">
          Ties this box to the solicitation. References roll up into the Compliance tab for
          coverage and gap detection.
        </p>
      </fieldset>
    </div>
  )
}

const CELL_STATUS_OPTIONS: { value: '' | CellStatus; label: string }[] = [
  { value: '', label: '· none' },
  { value: 'good', label: '✓ Good (green)' },
  { value: 'warn', label: '! Warn (amber)' },
  { value: 'bad', label: '✕ Bad (red)' },
  { value: 'info', label: 'i Info (blue)' },
]

const COLUMN_ALIGNS: { value: 'left' | 'center' | 'right'; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

/** Visual editor for the 'table' layout (RACI, QASP/SLA, L-to-M crosswalk...):
 *  columns, rows, per-cell text and status — no JSON required. */
function TableEditor({ chart, onChange }: Pick<Props, 'chart' | 'onChange'>) {
  const table = chart.table
  const setTable = (next: TableDef) => onChange({ ...chart, table: next })

  if (!table) {
    return (
      <div className="editor">
        <p className="hint">This chart uses the table layout but has no table yet.</p>
        <button onClick={() => setTable(emptyTable())}>Create a starter table</button>
      </div>
    )
  }

  const patchColumn = (ci: number, p: Partial<TableDef['columns'][number]>) => {
    const next = clone(table)
    next.columns[ci] = { ...next.columns[ci], ...p }
    setTable(next)
  }
  const patchCell = (ri: number, ci: number, p: { text?: string; status?: CellStatus | undefined }) => {
    const next = clone(table)
    const row = next.rows[ri]
    while (row.cells.length <= ci) row.cells.push({ text: '' })
    const cell = { ...row.cells[ci], ...p }
    if (!p.status) delete cell.status
    row.cells[ci] = cell
    setTable(next)
  }

  return (
    <div className="editor">
      <fieldset>
        <legend>Columns ({table.columns.length})</legend>
        {table.columns.map((c, ci) => (
          <div key={ci} className="card">
            <div className="detail-row">
              <input
                value={c.label}
                placeholder={`Column ${ci + 1}`}
                aria-label={`Column ${ci + 1} label`}
                onChange={(e) => patchColumn(ci, { label: e.target.value })}
              />
              <button className="sm" title="Move column left" disabled={ci === 0} onClick={() => setTable(tableMoveColumn(table, ci, -1))}>←</button>
              <button className="sm" title="Move column right" disabled={ci === table.columns.length - 1} onClick={() => setTable(tableMoveColumn(table, ci, 1))}>→</button>
              <button
                className="danger sm"
                aria-label={`Remove column ${c.label || ci + 1}`}
                disabled={table.columns.length <= 1}
                onClick={() => setTable(tableRemoveColumn(table, ci))}
              >×</button>
            </div>
            <div className="two-col">
              <label>Width (blank = auto)
                <input
                  type="number"
                  value={c.width ?? ''}
                  placeholder="auto"
                  onChange={(e) => patchColumn(ci, { width: e.target.value ? Math.max(40, Number(e.target.value)) : undefined })}
                />
              </label>
              <label>Align
                <select
                  value={c.align ?? (ci === 0 ? 'left' : 'center')}
                  onChange={(e) => patchColumn(ci, { align: e.target.value as 'left' | 'center' | 'right' })}
                >
                  {COLUMN_ALIGNS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </label>
            </div>
          </div>
        ))}
        <button onClick={() => setTable(tableAddColumn(table))}>+ Column</button>
      </fieldset>

      <fieldset>
        <legend>Rows ({table.rows.length})</legend>
        {table.rows.map((r, ri) => (
          <div key={ri} className="card">
            <div className="detail-row">
              <span className="row-tag">{r.header ? 'Section' : `Row ${ri + 1}`}</span>
              <button className="sm" title="Move row up" disabled={ri === 0} onClick={() => setTable(tableMoveRow(table, ri, -1))}>↑</button>
              <button className="sm" title="Move row down" disabled={ri === table.rows.length - 1} onClick={() => setTable(tableMoveRow(table, ri, 1))}>↓</button>
              <button
                className="danger sm"
                aria-label={`Remove row ${ri + 1}`}
                onClick={() => setTable(tableRemoveRow(table, ri))}
              >×</button>
            </div>
            {r.header ? (
              <input
                value={r.cells[0]?.text ?? ''}
                placeholder="Section heading"
                aria-label={`Section heading for row ${ri + 1}`}
                onChange={(e) => patchCell(ri, 0, { text: e.target.value })}
              />
            ) : (
              table.columns.map((c, ci) => (
                <div key={ci} className="detail-row">
                  <span className="detail-label cell-col" title={c.label}>{c.label || `Col ${ci + 1}`}</span>
                  <input
                    className="detail-text"
                    value={r.cells[ci]?.text ?? ''}
                    aria-label={`${c.label || `Column ${ci + 1}`}, row ${ri + 1}`}
                    onChange={(e) => patchCell(ri, ci, { text: e.target.value })}
                  />
                  <select
                    className="status-pick"
                    value={r.cells[ci]?.status ?? ''}
                    aria-label={`Status for ${c.label || `column ${ci + 1}`}, row ${ri + 1}`}
                    title="Cell status tint"
                    onChange={(e) => patchCell(ri, ci, { status: (e.target.value || undefined) as CellStatus | undefined })}
                  >
                    {CELL_STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              ))
            )}
          </div>
        ))}
        <div className="btn-row">
          <button onClick={() => setTable(tableAddRow(table))}>+ Row</button>
          <button onClick={() => setTable(tableAddRow(table, table.rows.length, true))}>+ Section row</button>
        </div>
      </fieldset>

      <label className="check">
        <input
          type="checkbox"
          checked={table.zebra !== false}
          onChange={(e) => setTable({ ...clone(table), zebra: e.target.checked ? undefined : false })}
        />
        Zebra striping (alternate row shading)
      </label>
      <p className="hint">
        Status tints color a cell green / amber / red / blue — used for RACI roles, QASP ratings,
        and crosswalk status columns.
      </p>
    </div>
  )
}

const SCALE_1_TO_5 = [1, 2, 3, 4, 5]

/** A starter register for a chart that just switched to the risk layout. */
function starterRiskCube(): RiskCube {
  return {
    risks: [
      {
        id: uid('r'),
        title: 'New risk',
        likelihood: 4,
        consequence: 4,
        residual: { likelihood: 2, consequence: 3 },
      },
    ],
  }
}

/** Visual editor for the 'risk' layout: the risk register with likelihood /
 *  consequence positions and optional post-mitigation (residual) targets. */
function RiskEditor({ chart, onChange }: Pick<Props, 'chart' | 'onChange'>) {
  const cube = chart.risk
  const setCube = (next: RiskCube) => onChange({ ...chart, risk: next })

  if (!cube) {
    return (
      <div className="editor">
        <p className="hint">This chart uses the risk-cube layout but has no risks yet.</p>
        <button onClick={() => setCube(starterRiskCube())}>Create a starter register</button>
      </div>
    )
  }

  const patchRisk = (i: number, p: Partial<RiskItem>) => {
    const next = clone(cube)
    next.risks[i] = { ...next.risks[i], ...p }
    if (p.residual === undefined && 'residual' in p) delete next.risks[i].residual
    setCube(next)
  }
  const moveRisk = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= cube.risks.length) return
    const next = clone(cube)
    ;[next.risks[i], next.risks[j]] = [next.risks[j], next.risks[i]]
    setCube(next)
  }

  const scaleSelect = (
    label: string,
    value: number,
    onPick: (v: number) => void,
  ) => (
    <label>{label}
      <select value={value} onChange={(e) => onPick(Number(e.target.value))}>
        {SCALE_1_TO_5.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </label>
  )

  return (
    <div className="editor">
      <div className="two-col">
        <label>X axis label
          <input
            value={cube.xLabel ?? ''}
            placeholder="Consequence"
            onChange={(e) => setCube({ ...clone(cube), xLabel: e.target.value || undefined })}
          />
        </label>
        <label>Y axis label
          <input
            value={cube.yLabel ?? ''}
            placeholder="Likelihood"
            onChange={(e) => setCube({ ...clone(cube), yLabel: e.target.value || undefined })}
          />
        </label>
      </div>

      <fieldset>
        <legend>Risk register ({cube.risks.length})</legend>
        {cube.risks.length === 0 && <p className="hint">No risks yet — add the first one below.</p>}
        {cube.risks.map((r, i) => {
          const level = riskLevel(r.likelihood, r.consequence)
          const residualLevel = r.residual ? riskLevel(r.residual.likelihood, r.residual.consequence) : null
          return (
            <div key={r.id} className="card">
              <div className="detail-row">
                <input
                  className="risk-code"
                  value={r.code ?? ''}
                  placeholder={`R${i + 1}`}
                  aria-label="Risk code"
                  title="Marker label on the cube (blank = auto-numbered)"
                  onChange={(e) => patchRisk(i, { code: e.target.value || undefined })}
                />
                <span className={`risk-pill lvl-${level}`}>{level}</span>
                <button className="sm" title="Move up" disabled={i === 0} onClick={() => moveRisk(i, -1)}>↑</button>
                <button className="sm" title="Move down" disabled={i === cube.risks.length - 1} onClick={() => moveRisk(i, 1)}>↓</button>
                <button
                  className="danger sm"
                  aria-label={`Remove risk ${r.code || i + 1}`}
                  onClick={() => setCube({ ...clone(cube), risks: cube.risks.filter((_, j) => j !== i) })}
                >×</button>
              </div>
              <input
                value={r.title}
                placeholder="Risk description"
                aria-label="Risk title"
                onChange={(e) => patchRisk(i, { title: e.target.value })}
              />
              <div className="two-col">
                {scaleSelect('Likelihood (1–5)', r.likelihood, (v) => patchRisk(i, { likelihood: v }))}
                {scaleSelect('Consequence (1–5)', r.consequence, (v) => patchRisk(i, { consequence: v }))}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!r.residual}
                  onChange={(e) =>
                    patchRisk(i, {
                      residual: e.target.checked
                        ? { likelihood: Math.max(1, r.likelihood - 2), consequence: Math.max(1, r.consequence - 1) }
                        : undefined,
                    })
                  }
                />
                Mitigated (residual) position — draws an arrow
              </label>
              {r.residual && (
                <div className="two-col">
                  {scaleSelect('Residual likelihood', r.residual.likelihood, (v) =>
                    patchRisk(i, { residual: { ...r.residual!, likelihood: v } }),
                  )}
                  {scaleSelect('Residual consequence', r.residual.consequence, (v) =>
                    patchRisk(i, { residual: { ...r.residual!, consequence: v } }),
                  )}
                </div>
              )}
              {residualLevel && (
                <p className="hint">Mitigation moves this risk from <b>{level}</b> to <b>{residualLevel}</b>.</p>
              )}
            </div>
          )
        })}
        <button
          onClick={() =>
            setCube({
              ...clone(cube),
              risks: [...cube.risks, { id: uid('r'), title: '', likelihood: 3, consequence: 3 }],
            })
          }
        >+ Risk</button>
      </fieldset>
      <p className="hint">
        Cell colors follow the standard 5×5 risk matrix (green / amber / red). Markers are
        auto-numbered R1, R2… in register order unless a code is set.
      </p>
    </div>
  )
}

const XY_KIND_OPTIONS: { value: XYSeriesKind; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area (filled)' },
  { value: 'bar', label: 'Bars' },
]

const XY_VARIANT_OPTIONS: { value: Exclude<Variant, 'hidden'>; label: string }[] = [
  { value: 'primary', label: 'Force (purple)' },
  { value: 'secondary', label: 'Sky (blue)' },
  { value: 'tertiary', label: 'Daylight (light blue)' },
  { value: 'accent', label: 'Supernova (orange)' },
]

/** A starter chart for a document that just switched to the xy layout. */
function starterXY(): XYChart {
  return {
    xLabel: 'Weeks after award',
    yLabel: 'Staff on site',
    series: [
      {
        id: uid('s'),
        label: 'Staffing',
        kind: 'line',
        points: [
          { x: 0, y: 10 },
          { x: 4, y: 45 },
          { x: 8, y: 80 },
          { x: 12, y: 100 },
        ],
      },
    ],
  }
}

/** Free-text "x, y per line" field. Keeps its own draft text so partly typed
 *  lines aren't rewritten mid-keystroke; only parseable lines are committed. */
function PointsField({ points, onCommit }: { points: XYPoint[]; onCommit: (pts: XYPoint[]) => void }) {
  const canon = points.map((p) => `${p.x}, ${p.y}`).join('\n')
  const [text, setText] = useState(canon)
  const lastCommitted = useRef(canon)
  // An external change (undo, template load, JSON apply) resets the draft.
  useEffect(() => {
    if (canon !== lastCommitted.current) {
      setText(canon)
      lastCommitted.current = canon
    }
  }, [canon])
  return (
    <label>Points (x, y — one per line)
      <textarea
        rows={5}
        value={text}
        spellCheck={false}
        placeholder={'0, 10\n4, 45\n8, 80'}
        onChange={(e) => {
          setText(e.target.value)
          const pts = parsePoints(e.target.value)
          lastCommitted.current = pts.map((p) => `${p.x}, ${p.y}`).join('\n')
          onCommit(pts)
        }}
      />
    </label>
  )
}

/** Visual editor for the 'xy' layout: axis titles plus one card per series
 *  (label, mark type, brand color, data points). */
function XYEditor({ chart, onChange }: Pick<Props, 'chart' | 'onChange'>) {
  const xy = chart.xy
  const setXY = (next: XYChart) => onChange({ ...chart, xy: next })

  if (!xy) {
    return (
      <div className="editor">
        <p className="hint">This chart uses the XY layout but has no data yet.</p>
        <button onClick={() => setXY(starterXY())}>Create a starter series</button>
      </div>
    )
  }

  const patchSeries = (i: number, p: Partial<XYSeries>) => {
    const next = clone(xy)
    next.series[i] = { ...next.series[i], ...p }
    setXY(next)
  }
  const moveSeries = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= xy.series.length) return
    const next = clone(xy)
    ;[next.series[i], next.series[j]] = [next.series[j], next.series[i]]
    setXY(next)
  }

  return (
    <div className="editor">
      <div className="two-col">
        <label>X axis label
          <input
            value={xy.xLabel ?? ''}
            placeholder="e.g. Weeks after award"
            onChange={(e) => setXY({ ...clone(xy), xLabel: e.target.value || undefined })}
          />
        </label>
        <label>Y axis label
          <input
            value={xy.yLabel ?? ''}
            placeholder="e.g. FTEs on site"
            onChange={(e) => setXY({ ...clone(xy), yLabel: e.target.value || undefined })}
          />
        </label>
      </div>

      <fieldset>
        <legend>Series ({xy.series.length})</legend>
        {xy.series.length === 0 && <p className="hint">No series yet — add the first one below.</p>}
        {xy.series.map((s, i) => (
          <div key={s.id} className="card">
            <div className="detail-row">
              <input
                value={s.label}
                placeholder={`Series ${i + 1}`}
                aria-label="Series label"
                onChange={(e) => patchSeries(i, { label: e.target.value })}
              />
              <button className="sm" title="Move up (draws earlier)" disabled={i === 0} onClick={() => moveSeries(i, -1)}>↑</button>
              <button className="sm" title="Move down (draws later)" disabled={i === xy.series.length - 1} onClick={() => moveSeries(i, 1)}>↓</button>
              <button
                className="danger sm"
                aria-label={`Remove series ${s.label || i + 1}`}
                onClick={() => setXY({ ...clone(xy), series: xy.series.filter((_, j) => j !== i) })}
              >×</button>
            </div>
            <div className="two-col">
              <label>Mark
                <select value={s.kind} onChange={(e) => patchSeries(i, { kind: e.target.value as XYSeriesKind })}>
                  {XY_KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </label>
              <label>Color
                <select
                  value={s.variant ?? XY_VARIANT_OPTIONS[i % XY_VARIANT_OPTIONS.length].value}
                  onChange={(e) => patchSeries(i, { variant: e.target.value as Exclude<Variant, 'hidden'> })}
                >
                  {XY_VARIANT_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </label>
            </div>
            <PointsField points={s.points} onCommit={(points) => patchSeries(i, { points })} />
          </div>
        ))}
        <button
          onClick={() =>
            setXY({
              ...clone(xy),
              series: [...xy.series, { id: uid('s'), label: '', kind: 'line', points: [] }],
            })
          }
        >+ Series</button>
      </fieldset>
      <p className="hint">
        Lines and areas connect points in the order entered; bars group side-by-side at each x.
        Use it for staffing ramps, risk burndown, ROI and benefits curves.
      </p>
    </div>
  )
}

function ChartEditor({ chart, onChange, onSelect }: Props) {
  const nodes = allNodes(chart)
  const options = nodes
    .filter(({ node }) => node.variant !== 'hidden')
    .map(({ node }) => ({ id: node.id, label: node.title || '(untitled)' }))

  const workshare = workshareRollup(chart)
  const schedulePhases: SchedulePhase[] = chart.schedule?.phases ?? []
  const setSchedulePhases = (next: SchedulePhase[]) =>
    onChange({
      ...chart,
      schedule: { ...(chart.schedule ?? { unit: 'day' }), phases: next.length ? next : undefined },
    })

  return (
    <div className="editor">
      <label>Chart title
        <input
          value={chart.meta.title}
          onChange={(e) => onChange({ ...chart, meta: { ...chart.meta, title: e.target.value } })}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={chart.meta.showTitle}
          onChange={(e) => onChange({ ...chart, meta: { ...chart.meta, showTitle: e.target.checked } })}
        />
        Show title on chart
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!chart.meta.showComplianceOverlay}
          onChange={(e) =>
            onChange({ ...chart, meta: { ...chart.meta, showComplianceOverlay: e.target.checked || undefined } })
          }
        />
        Show compliance on chart (box badges + gaps panel)
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!chart.meta.showWbsNumbers}
          onChange={(e) =>
            onChange({ ...chart, meta: { ...chart.meta, showWbsNumbers: e.target.checked || undefined } })
          }
        />
        Show WBS outline numbers
      </label>
      <label>Figure caption (shown under the chart, included in exports)
        <textarea
          rows={2}
          value={chart.meta.caption ?? ''}
          placeholder="e.g. A single accountable lead on every PWS task cuts handoffs and retires transition risk by day 30."
          onChange={(e) => onChange({ ...chart, meta: { ...chart.meta, caption: e.target.value || undefined } })}
        />
      </label>
      <label>Classification / CUI banner (top &amp; bottom, in exports)
        <input
          list="banner-presets"
          value={chart.meta.banner ?? ''}
          placeholder="e.g. CUI"
          onChange={(e) => onChange({ ...chart, meta: { ...chart.meta, banner: e.target.value || undefined } })}
        />
        <datalist id="banner-presets">
          <option value="UNCLASSIFIED" />
          <option value="UNCLASSIFIED//FOUO" />
          <option value="CUI" />
          <option value="CONFIDENTIAL" />
          <option value="SECRET" />
          <option value="TOP SECRET" />
        </datalist>
      </label>
      <label>Layout
        <select
          value={chart.meta.layout ?? 'tree'}
          onChange={(e) => {
            const layout = e.target.value as LayoutMode
            const next = { ...chart, meta: { ...chart.meta, layout } }
            // Seed starter content when switching to a data layout for the
            // first time, so the canvas (and its editor tab) has something to show.
            if (layout === 'table' && !chart.table) next.table = emptyTable()
            if (layout === 'risk' && !chart.risk) next.risk = starterRiskCube()
            if (layout === 'xy' && !chart.xy) next.xy = starterXY()
            onChange(next)
          }}
        >
          {LAYOUT_MODES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>
      {chart.meta.layout === 'table' && (
        <p className="hint">
          This is a table. Edit its columns, rows and cell statuses in the <b>Table</b> tab.
        </p>
      )}
      {chart.meta.layout === 'risk' && (
        <p className="hint">
          This is a 5×5 risk cube. Edit the risk register in the <b>Risks</b> tab.
        </p>
      )}
      {chart.meta.layout === 'xy' && (
        <p className="hint">
          This is an XY chart. Edit its series and data points in the <b>Data</b> tab.
        </p>
      )}
      <label>Flow direction
        <select
          value={chart.meta.direction ?? 'TB'}
          disabled={(chart.meta.layout ?? 'tree') !== 'tree'}
          onChange={(e) => onChange({ ...chart, meta: { ...chart.meta, direction: e.target.value as Direction } })}
        >
          {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </label>
      {chart.meta.layout === 'timeline' && (
        <fieldset>
          <legend>Schedule</legend>
          <div className="two-col">
            <label>Unit
              <select
                value={chart.schedule?.unit ?? 'day'}
                onChange={(e) =>
                  onChange({
                    ...chart,
                    schedule: { ...(chart.schedule ?? {}), unit: e.target.value as 'day' | 'week' | 'month' },
                  })
                }
              >
                <option value="day">Days</option>
                <option value="week">Weeks</option>
                <option value="month">Months</option>
              </select>
            </label>
            <label>Span (blank = auto)
              <input
                type="number"
                value={chart.schedule?.span ?? ''}
                placeholder="auto"
                onChange={(e) =>
                  onChange({
                    ...chart,
                    schedule: {
                      ...(chart.schedule ?? { unit: 'day' }),
                      span: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value)),
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="phase-head">Phase markers</div>
          {schedulePhases.map((p, i) => (
            <div key={i} className="detail-row">
              <input
                value={p.label}
                placeholder="30-Day"
                aria-label="Phase label"
                onChange={(e) => {
                  const next = clone(schedulePhases)
                  next[i] = { ...next[i], label: e.target.value }
                  setSchedulePhases(next)
                }}
              />
              <input
                className="phase-at"
                type="number"
                value={p.at}
                aria-label="Phase position (units)"
                onChange={(e) => {
                  const next = clone(schedulePhases)
                  next[i] = { ...next[i], at: Number(e.target.value) }
                  setSchedulePhases(next)
                }}
              />
              <button
                className="danger sm"
                aria-label="Remove phase"
                onClick={() => setSchedulePhases(schedulePhases.filter((_, j) => j !== i))}
              >×</button>
            </div>
          ))}
          <button className="sm" onClick={() => setSchedulePhases([...schedulePhases, { label: 'Phase', at: 30 }])}>
            + Phase
          </button>
          {schedulePhases.length === 0 && (
            <p className="hint">No custom phases — defaults to 30/60/90 for day units.</p>
          )}
        </fieldset>
      )}

      {workshare.entries.length > 0 && (
        <fieldset>
          <legend>Workshare rollup</legend>
          <div className="cov-head">
            <span className="cov-pct" style={{ color: workshare.balanced ? 'var(--ok)' : 'var(--warn)' }}>
              {workshare.total}%
            </span>
            <span className="cov-sub">
              {workshare.balanced
                ? `balances across ${workshare.entries.length} teammates`
                : `does not total 100% (${workshare.entries.length} teammates)`}
            </span>
          </div>
          {workshare.entries.map((e) => (
            <div key={e.id} className="ws-row">
              <button className="link" onClick={() => onSelect(e.id)}>{e.title}</button>
              {e.category !== 'Other' && <span className="ws-cat">{e.category}</span>}
              <span className="ws-pct">{e.percent}%</span>
            </div>
          ))}
          {workshare.smallBusinessTotal > 0 && (
            <>
              <div className="phase-head">Small-business participation — {workshare.smallBusinessTotal}%</div>
              <div className="cov-kinds">
                {workshare.byCategory
                  .filter((c) => c.category !== 'Other')
                  .map((c) => (
                    <span key={c.category} className="cov-kind">
                      {c.category} <b>{c.percent}%</b>
                    </span>
                  ))}
              </div>
            </>
          )}
          <p className="hint">Summed from each box's "Workshare" and "Category" detail rows.</p>
        </fieldset>
      )}

      <button onClick={() => { const r = addRoot(chart); onChange(r.chart); onSelect(r.newId) }}>
        + Add independent tree / column
      </button>

      <fieldset>
        <legend>Group zones</legend>
        {chart.groups.map((g, gi) => (
          <div key={g.id} className="card">
            <div className="detail-row">
              <input
                value={g.label ?? ''}
                placeholder="Zone label"
                onChange={(e) => {
                  const groups = clone(chart.groups)
                  groups[gi] = { ...groups[gi], label: e.target.value }
                  onChange({ ...chart, groups })
                }}
              />
              <select
                value={g.style}
                aria-label="Zone style"
                onChange={(e) => {
                  const groups = clone(chart.groups)
                  groups[gi] = { ...groups[gi], style: e.target.value as ZoneStyle }
                  onChange({ ...chart, groups })
                }}
              >
                {ZONE_STYLES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
              <button
                className="danger sm"
                onClick={() => onChange({ ...chart, groups: chart.groups.filter((x) => x.id !== g.id) })}
              >×</button>
            </div>
            <div className="member-list">
              {options.map((o) => (
                <label key={o.id} className="check">
                  <input
                    type="checkbox"
                    checked={g.memberIds.includes(o.id)}
                    onChange={(e) => {
                      const groups = clone(chart.groups)
                      const set = new Set(groups[gi].memberIds)
                      if (e.target.checked) set.add(o.id)
                      else set.delete(o.id)
                      groups[gi] = { ...groups[gi], memberIds: [...set] }
                      onChange({ ...chart, groups })
                    }}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={() =>
            onChange({
              ...chart,
              groups: [...chart.groups, { id: uid('g'), label: 'Mission Focus', style: 'green', memberIds: [] }],
            })
          }
        >+ Group zone</button>
      </fieldset>

      <fieldset>
        <legend>Edges (connections)</legend>
        {chart.comms.map((c, ci) => {
          const patchEdge = (p: Partial<CommLink>) => {
            const comms = clone(chart.comms)
            comms[ci] = { ...comms[ci], ...p }
            onChange({ ...chart, comms })
          }
          return (
            <div key={c.id} className="card">
              <div className="detail-row">
                <select value={c.fromId} aria-label="Edge from" onChange={(e) => patchEdge({ fromId: e.target.value })}>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <span className="arrow">→</span>
                <select value={c.toId} aria-label="Edge to" onChange={(e) => patchEdge({ toId: e.target.value })}>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <button
                  className="danger sm"
                  onClick={() => onChange({ ...chart, comms: chart.comms.filter((x) => x.id !== c.id) })}
                >×</button>
              </div>
              <div className="two-col">
                <select value={c.style ?? 'solid'} aria-label="Edge line style" onChange={(e) => patchEdge({ style: e.target.value as EdgeStyle })}>
                  {EDGE_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <select value={edgeArrow(c)} aria-label="Edge arrows" onChange={(e) => patchEdge({ arrow: e.target.value as EdgeArrow })}>
                  {EDGE_ARROWS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <input
                value={c.label ?? ''}
                placeholder="Edge label (optional)"
                onChange={(e) => patchEdge({ label: e.target.value || undefined })}
              />
            </div>
          )
        })}
        <button
          disabled={options.length < 2}
          onClick={() =>
            onChange({
              ...chart,
              comms: [
                ...chart.comms,
                { id: uid('c'), fromId: options[0].id, toId: options[1].id, arrow: 'both', style: 'solid' },
              ],
            })
          }
        >+ Edge</button>
      </fieldset>

      <fieldset>
        <legend>Legend</legend>
        {chart.legend.map((l, li) => (
          <div key={l.id} className="detail-row">
            <select
              value={l.marker}
              aria-label="Legend marker"
              onChange={(e) => {
                const legend = clone(chart.legend)
                legend[li] = { ...legend[li], marker: e.target.value as LegendMarker }
                onChange({ ...chart, legend })
              }}
            >
              {MARKERS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <input
              value={l.label}
              placeholder="Legend label"
              onChange={(e) => {
                const legend = clone(chart.legend)
                legend[li] = { ...legend[li], label: e.target.value }
                onChange({ ...chart, legend })
              }}
            />
            <button
              className="danger sm"
              onClick={() => onChange({ ...chart, legend: chart.legend.filter((x) => x.id !== l.id) })}
            >×</button>
          </div>
        ))}
        <div className="btn-row">
          <button
            onClick={() =>
              onChange({ ...chart, legend: [...chart.legend, { id: uid('l'), marker: 'keyGold', label: 'RFP Required' }] })
            }
          >+ Legend item</button>
          <button
            className="sm"
            title="Add legend entries for the box styles, badges, zones and edges used in this chart"
            onClick={() => {
              const have = new Set(chart.legend.map((l) => l.marker))
              const additions = autoLegend(chart).filter((i) => !have.has(i.marker))
              if (additions.length) onChange({ ...chart, legend: [...chart.legend, ...additions] })
            }}
          >Auto-add from chart</button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Astrion brand palette (locked)</legend>
        <div className="swatches">
          {COLOR_SWATCHES.map(({ label, color }) => (
            <div key={label} className="swatch">
              <span style={{ background: color }} />
              <small>{label}<br />{color}</small>
            </div>
          ))}
        </div>
        <p className="hint">
          Colors per the Astrion Brand Standards (Dec 2023 V.1). Edit <code>src/theme.ts</code> to
          update tokens globally.
        </p>
      </fieldset>
    </div>
  )
}

function JsonEditor({ chart, onChange }: Pick<Props, 'chart' | 'onChange'>) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setText(JSON.stringify(chart, null, 2))
    setError(null)
  }, [chart])

  return (
    <div className="editor">
      <p className="hint">
        The full chart definition. Save this JSON with your proposal to reproduce the chart exactly.
      </p>
      <textarea className="json" rows={24} value={text} aria-label="Chart JSON" onChange={(e) => setText(e.target.value)} spellCheck={false} />
      {error && <p className="error">{error}</p>}
      <div className="btn-row">
        <button
          onClick={() => {
            try {
              // Validates, fills defaults, and enforces brand-only colors.
              onChange(normalizeChart(JSON.parse(text)))
              setError(null)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Invalid JSON')
            }
          }}
        >Apply JSON</button>
        <button onClick={() => navigator.clipboard.writeText(text)}>Copy</button>
      </div>
    </div>
  )
}

function ComplianceEditor({ chart, onChange, onSelect }: Props) {
  const requirements = chart.compliance?.requirements ?? []
  const report = useMemo(() => computeCompliance(chart), [chart])
  const [bulk, setBulk] = useState('')
  const [bulkKind, setBulkKind] = useState<RefKind>('PWS')
  // Transiently highlight a requirement row after "jump to first gap".
  const [flashId, setFlashId] = useState<string | null>(null)

  const anyRefs = allNodes(chart).some(({ node }) => (node.refs ?? []).length > 0)
  const firstGapId = report.rows.find((r) => r.status === 'gap')?.requirement.id ?? null

  useEffect(() => {
    if (!flashId) return
    const t = setTimeout(() => setFlashId(null), 1600)
    return () => clearTimeout(t)
  }, [flashId])

  const jumpToFirstGap = () => {
    if (!firstGapId) return
    setFlashId(firstGapId)
    const el = document.getElementById(`req-row-${firstGapId}`)
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' })
  }

  const setRequirements = (reqs: Requirement[]) =>
    onChange({ ...chart, compliance: reqs.length ? { requirements: reqs } : undefined })

  const patchReq = (i: number, p: Partial<Requirement>) => {
    const reqs = clone(requirements)
    reqs[i] = { ...reqs[i], ...p }
    setRequirements(reqs)
  }

  const parsed = parseRequirements(bulk, bulkKind).filter((r) => r.ref.trim())
  const addBulk = () => {
    const existing = new Set(requirements.map((r) => `${r.kind} ${normalizeRef(r.ref)}`))
    const merged = [...requirements]
    for (const r of parsed) {
      const key = `${r.kind} ${normalizeRef(r.ref)}`
      if (!existing.has(key)) {
        existing.add(key)
        merged.push({ ...r, id: uid('req') })
      }
    }
    setRequirements(merged)
    setBulk('')
  }

  return (
    <div className="editor">
      <p className="hint">
        The register is the authoritative list of solicitation requirements. Each box's References
        are matched against it, so coverage and gaps update live.
      </p>

      {report.coverage.total > 0 && (
        <div className="cov">
          <div className="cov-head">
            <span className="cov-pct">{report.coverage.pct}%</span>
            <span className="cov-sub">
              {report.coverage.covered} of {report.coverage.total} requirements covered
            </span>
          </div>
          <div className="cov-bar" role="img" aria-label={`${report.coverage.pct}% covered`}>
            <span style={{ width: `${report.coverage.pct}%` }} />
          </div>
          <div className="cov-kinds">
            {report.byKind.map((k) => (
              <span key={k.kind} className="cov-kind">
                {REF_KIND_LABEL[k.kind]} <b>{k.covered}/{k.total}</b>
              </span>
            ))}
          </div>
          {firstGapId && (
            <button className="sm cov-jump" onClick={jumpToFirstGap}>
              ↓ Jump to first gap
            </button>
          )}
        </div>
      )}

      {report.orphans.length > 0 && (
        <div className="orphans" role="alert">
          <b>{report.orphans.length}</b> reference{report.orphans.length === 1 ? ' matches' : 's match'} no
          registered requirement (typo, or a requirement to add):
          <ul>
            {report.orphans.map((o, i) => (
              <li key={i}>
                <button className="link" onClick={() => onSelect(o.nodeId)}>{o.title}</button>
                {' → '}
                {REF_KIND_LABEL[o.kind]} {o.ref}
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset>
        <legend>Requirements register</legend>
        {requirements.length === 0 && (
          <p className="hint">None yet. Add one at a time, or paste an outline below.</p>
        )}
        {report.rows.map((row, i) => (
          <div
            key={row.requirement.id}
            id={`req-row-${row.requirement.id}`}
            className={`req card${flashId === row.requirement.id ? ' flash' : ''}`}
          >
            <div className="detail-row">
              <span className={`status-pill ${row.status}`}>
                {row.status === 'covered' ? 'Covered' : 'Gap'}
              </span>
              <select
                aria-label="Requirement kind"
                value={row.requirement.kind}
                onChange={(e) => patchReq(i, { kind: e.target.value as RefKind })}
              >
                {REF_KINDS.map((k) => <option key={k} value={k}>{REF_KIND_LABEL[k]}</option>)}
              </select>
              <input
                className="req-ref"
                aria-label="Requirement reference"
                value={row.requirement.ref}
                placeholder="3.2.1"
                onChange={(e) => patchReq(i, { ref: e.target.value })}
              />
              <button
                className="danger sm"
                aria-label="Remove requirement"
                onClick={() => setRequirements(requirements.filter((x) => x.id !== row.requirement.id))}
              >×</button>
            </div>
            <input
              aria-label="Requirement title"
              value={row.requirement.title ?? ''}
              placeholder="Short description (optional)"
              onChange={(e) => patchReq(i, { title: e.target.value || undefined })}
            />
            <div className="owners">
              {row.owners.length ? (
                row.owners.map((o) => (
                  <button
                    key={o.id}
                    className="owner-chip"
                    title="Select this box"
                    onClick={() => onSelect(o.id)}
                  >
                    {o.title}
                  </button>
                ))
              ) : (
                <span className="owners-none">No box addresses this yet</span>
              )}
            </div>
          </div>
        ))}
        <button onClick={() => setRequirements([...requirements, { id: uid('req'), kind: 'PWS', ref: '' }])}>
          + Requirement
        </button>
      </fieldset>

      <fieldset>
        <legend>Bulk add from outline</legend>
        <label>Kind for pasted lines
          <select value={bulkKind} onChange={(e) => setBulkKind(e.target.value as RefKind)}>
            {REF_KINDS.map((k) => <option key={k} value={k}>{REF_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <textarea
          rows={5}
          value={bulk}
          placeholder={'One requirement per line, e.g.\n3.2.1 Manage the program schedule\n3.2.2 Staff key positions'}
          onChange={(e) => setBulk(e.target.value)}
        />
        <button disabled={!parsed.length} onClick={addBulk}>
          Add {parsed.length || ''} requirement{parsed.length === 1 ? '' : 's'}
        </button>
      </fieldset>

      <div className="btn-row">
        <button
          disabled={!requirements.length}
          onClick={() => exportCsv(buildComplianceCsv(report), chart.meta.title)}
        >
          Export coverage CSV
        </button>
        <button
          disabled={!anyRefs}
          title="One row per box reference (who owns what)"
          onClick={() => exportCsv(buildTraceabilityCsv(chart), chart.meta.title, 'by-box')}
        >
          Export by-box CSV
        </button>
      </div>
    </div>
  )
}

type LibraryProps = {
  library: LibraryEntry[]
  onLibraryChange: (next: LibraryEntry[]) => void
  onLoadEntry: (entry: LibraryEntry) => void
}

function LibraryEditor({ chart, library, onLibraryChange, onLoadEntry }: Pick<Props, 'chart'> & LibraryProps) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [approved, setApproved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addCurrent = () => {
    const entry = entryFromChart(chart, name, {
      description: desc,
      approved,
      updatedAt: new Date().toISOString(),
    })
    onLibraryChange(mergeLibrary(library, [entry]))
    setName('')
    setDesc('')
    setApproved(false)
  }

  const importPack = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const incoming = normalizeLibrary(JSON.parse(String(reader.result)))
        if (!incoming.length) {
          window.alert('No valid library entries were found in that file.')
          return
        }
        onLibraryChange(mergeLibrary(library, incoming))
      } catch (e) {
        window.alert(`Could not import: ${e instanceof Error ? e.message : 'invalid file'}`)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="editor">
      <p className="hint">
        A shared set of approved starting points. Save the library as a pack and keep it in a shared
        folder (e.g. SharePoint); teammates import it and its entries appear in the template picker.
      </p>

      <fieldset>
        <legend>Add the current chart</legend>
        <label>Name
          <input value={name} placeholder={chart.meta.title || 'Untitled'} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>Description (optional)
          <input value={desc} placeholder="When to use this starting point" onChange={(e) => setDesc(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
          Mark approved for use
        </label>
        <button onClick={addCurrent}>+ Add to library</button>
      </fieldset>

      <fieldset>
        <legend>Library ({library.length})</legend>
        {library.length === 0 && <p className="hint">Empty. Add the current chart, or import a pack below.</p>}
        {library.map((e) => (
          <div key={e.id} className="card">
            <div className="ws-row">
              <span className="lib-name">
                {e.approved && <span className="lib-star" title="Approved for use">★</span>}
                {e.name}
              </span>
              <button className="sm" onClick={() => onLoadEntry(e)}>Load</button>
              <button
                className="danger sm"
                aria-label="Remove from library"
                onClick={() => onLibraryChange(library.filter((x) => x.id !== e.id))}
              >×</button>
            </div>
            {e.description && <p className="lib-desc">{e.description}</p>}
          </div>
        ))}
      </fieldset>

      <div className="btn-row">
        <button
          disabled={!library.length}
          onClick={() => exportLibraryPack(makePack(library), 'astrion-proposal-cop-library')}
        >
          Export pack
        </button>
        <button onClick={() => fileRef.current?.click()}>Import pack</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importPack(f)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

export function SidePanel({
  width,
  library,
  onLibraryChange,
  onLoadEntry,
  ...props
}: Props & { width: number } & LibraryProps) {
  const [tab, setTab] = useState<'build' | 'chart' | 'compliance' | 'library' | 'json'>('build')

  // The first tab edits the chart's content, so it follows the layout mode:
  // boxes for node layouts, the grid editor for tables, the register for risk
  // cubes, the series editor for xy charts. Its label matches.
  const layoutMode = props.chart.meta.layout ?? 'tree'
  const buildLabel =
    layoutMode === 'table' ? 'Table' : layoutMode === 'risk' ? 'Risks' : layoutMode === 'xy' ? 'Data' : 'Boxes'

  // Selecting a box anywhere (including clicking it in the chart) jumps the
  // panel to the Boxes tab so its editor and tree row are shown immediately.
  useEffect(() => {
    if (props.selectedId) setTab('build')
  }, [props.selectedId])

  // Scale the panel's text with its width so a wider panel reads larger. Every
  // inner font size is defined in em, so they all track this single base.
  const fontSize = Math.min(18, Math.max(13, 14 + (width - 340) * 0.009))
  return (
    <aside
      className="side-panel"
      style={{ width, minWidth: width, maxWidth: width, fontSize: `${fontSize}px` }}
    >
      <div className="tabs" role="group" aria-label="Editor sections">
        <button aria-pressed={tab === 'build'} className={tab === 'build' ? 'active' : ''} onClick={() => setTab('build')}>{buildLabel}</button>
        <button aria-pressed={tab === 'chart'} className={tab === 'chart' ? 'active' : ''} onClick={() => setTab('chart')}>Chart</button>
        <button aria-pressed={tab === 'compliance'} className={tab === 'compliance' ? 'active' : ''} onClick={() => setTab('compliance')}>Compliance</button>
        <button aria-pressed={tab === 'library'} className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>Library</button>
        <button aria-pressed={tab === 'json'} className={tab === 'json' ? 'active' : ''} onClick={() => setTab('json')}>JSON</button>
      </div>
      {tab === 'build' &&
        (layoutMode === 'table' ? (
          <TableEditor chart={props.chart} onChange={props.onChange} />
        ) : layoutMode === 'risk' ? (
          <RiskEditor chart={props.chart} onChange={props.onChange} />
        ) : layoutMode === 'xy' ? (
          <XYEditor chart={props.chart} onChange={props.onChange} />
        ) : (
          <>
            <NodeTree chart={props.chart} selectedId={props.selectedId} onSelect={props.onSelect} />
            <NodeEditor {...props} />
          </>
        ))}
      {tab === 'chart' && <ChartEditor {...props} />}
      {tab === 'compliance' && <ComplianceEditor {...props} />}
      {tab === 'library' && (
        <LibraryEditor
          chart={props.chart}
          library={library}
          onLibraryChange={onLibraryChange}
          onLoadEntry={onLoadEntry}
        />
      )}
      {tab === 'json' && <JsonEditor chart={props.chart} onChange={props.onChange} />}
    </aside>
  )
}
