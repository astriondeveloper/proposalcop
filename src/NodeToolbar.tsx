import { Fragment, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { OrgChart } from './model'
import { addChild, addSibling, deleteNode, duplicateNode, findNode, updateNode } from './model'
import { palette } from './theme'

/** Screen position for the floating toolbar, in canvas-wrap coordinates. */
export interface Anchor {
  left: number
  top: number
  placement: 'above' | 'below'
  /** Horizontal offset of the caret from the toolbar center (px). */
  caretShift: number
}

interface Props {
  anchor: Anchor
  chart: OrgChart
  nodeId: string
  onChange: (next: OrgChart) => void
  onSelect: (id: string | null) => void
  returnFocus: () => void
}

/** Brand-only quick-pick palette — same source as the inspector, so the
 *  toolbar can never introduce an off-brand color. */
const COLOR_SWATCHES = Object.entries(palette).map(([k, color]) => ({
  label: k[0].toUpperCase() + k.slice(1),
  color,
}))

const svgProps = {
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const IconChild = () => (
  <svg {...svgProps}>
    <rect x="8" y="3" width="8" height="6" rx="1.5" />
    <path d="M12 9v5" />
    <path d="M9 19h6" />
    <path d="M12 16v6" />
  </svg>
)
const IconSibling = () => (
  <svg {...svgProps}>
    <rect x="2.5" y="9" width="8" height="6" rx="1.5" />
    <rect x="13.5" y="9" width="8" height="6" rx="1.5" />
    <path d="M11 12h2.5" />
  </svg>
)
const IconDup = () => (
  <svg {...svgProps}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h9" />
  </svg>
)
const IconTrash = () => (
  <svg {...svgProps}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    <path d="M9 7V4h6v3" />
  </svg>
)

export function NodeToolbar({ anchor, chart, nodeId, onChange, onSelect, returnFocus }: Props) {
  const node = findNode(chart, nodeId)
  const rootRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(0)
  const [popFocusIdx, setPopFocusIdx] = useState(0)
  const wantFocusRef = useRef(false)

  const isSoleRoot = chart.roots.length === 1 && chart.roots[0].id === nodeId
  const focusColorBtn = () => rootRef.current?.querySelector<HTMLButtonElement>('.tb-color')?.focus()

  // Reset transient UI whenever the selected node changes.
  useEffect(() => {
    setPopoverOpen(false)
    setFocusIdx(0)
  }, [nodeId])

  // When the color popover opens, move focus onto the current (or first) swatch.
  useEffect(() => {
    if (!popoverOpen) return
    const checked = COLOR_SWATCHES.findIndex((s) => s.color === node?.color)
    const idx = checked >= 0 ? checked : COLOR_SWATCHES.length
    setPopFocusIdx(idx)
    const id = requestAnimationFrame(() => {
      popRef.current?.querySelectorAll<HTMLButtonElement>('.tb-sw')[idx]?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [popoverOpen, node?.color])

  // After an add/duplicate, move focus to the first toolbar button on the
  // re-anchored toolbar so keyboard users stay in place.
  useEffect(() => {
    if (!wantFocusRef.current) return
    wantFocusRef.current = false
    rootRef.current?.querySelector<HTMLButtonElement>('.tb-btn:not(:disabled)')?.focus()
    setFocusIdx(0)
  }, [nodeId])

  // Close the color popover on any outside pointer press.
  useEffect(() => {
    if (!popoverOpen) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPopoverOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [popoverOpen])

  if (!node) return null

  const act = (fn: () => { chart: OrgChart; newId: string }) => {
    const r = fn()
    wantFocusRef.current = true
    onChange(r.chart)
    onSelect(r.newId)
  }

  const applyColor = (color?: string) => {
    onChange(updateNode(chart, nodeId, { color }))
    setPopoverOpen(false)
    focusColorBtn()
  }

  const buttons = [
    { key: 'child', label: 'Add child', icon: <IconChild />, onClick: () => act(() => addChild(chart, nodeId)) },
    { key: 'sibling', label: 'Add sibling', icon: <IconSibling />, onClick: () => act(() => addSibling(chart, nodeId)) },
    { key: 'dup', label: 'Duplicate', icon: <IconDup />, shortcut: 'Control+D', onClick: () => act(() => duplicateNode(chart, nodeId)) },
    { key: 'color', label: 'Box color', color: true, onClick: () => setPopoverOpen((o) => !o) },
    {
      key: 'delete',
      label: 'Delete',
      icon: <IconTrash />,
      danger: true,
      shortcut: 'Delete',
      disabled: isSoleRoot,
      onClick: () => {
        onChange(deleteNode(chart, nodeId))
        onSelect(null)
        returnFocus()
      },
    },
  ]

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Let the color popover handle its own keys when it owns focus.
    if (popoverOpen && popRef.current?.contains(e.target as Node)) return
    if (e.key === 'Escape') {
      if (popoverOpen) {
        setPopoverOpen(false)
        focusColorBtn()
      } else {
        returnFocus()
      }
      return
    }
    const enabled = buttons.map((b, i) => (b.disabled ? -1 : i)).filter((i) => i >= 0)
    const cur = Math.max(0, enabled.indexOf(focusIdx))
    let ni = cur
    if (e.key === 'ArrowRight') ni = (cur + 1) % enabled.length
    else if (e.key === 'ArrowLeft') ni = (cur - 1 + enabled.length) % enabled.length
    else if (e.key === 'Home') ni = 0
    else if (e.key === 'End') ni = enabled.length - 1
    else return
    e.preventDefault()
    const target = enabled[ni]
    setFocusIdx(target)
    rootRef.current?.querySelectorAll<HTMLButtonElement>('.tb-btn')[target]?.focus()
  }

  const onPopKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const count = COLOR_SWATCHES.length + 1
    if (e.key === 'Escape') {
      e.stopPropagation()
      setPopoverOpen(false)
      focusColorBtn()
      return
    }
    let ni = popFocusIdx
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') ni = (popFocusIdx + 1) % count
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ni = (popFocusIdx - 1 + count) % count
    else if (e.key === 'Home') ni = 0
    else if (e.key === 'End') ni = count - 1
    else return
    e.preventDefault()
    e.stopPropagation()
    setPopFocusIdx(ni)
    popRef.current?.querySelectorAll<HTMLButtonElement>('.tb-sw')[ni]?.focus()
  }

  const style = {
    left: anchor.left,
    top: anchor.top,
    '--caret-x': `calc(50% + ${anchor.caretShift}px)`,
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      className="node-toolbar"
      role="toolbar"
      aria-label={`Actions for ${node.title || 'box'}`}
      aria-orientation="horizontal"
      data-placement={anchor.placement}
      style={style}
      onKeyDown={onKeyDown}
    >
      {buttons.map((b, i) => (
        <Fragment key={b.key}>
          {(i === 2 || i === 4) && <span className="tb-sep" />}
          <button
            className={`tb-btn${b.danger ? ' danger' : ''}${b.color ? ' tb-color' : ''}`}
            type="button"
            tabIndex={i === focusIdx ? 0 : -1}
            aria-label={b.label}
            title={b.label}
            disabled={b.disabled}
            aria-keyshortcuts={b.shortcut}
            aria-haspopup={b.color ? 'true' : undefined}
            aria-expanded={b.color ? popoverOpen : undefined}
            onClick={b.onClick}
          >
            {b.color ? (
              <span className="tb-swatch" style={{ background: node.color ?? 'currentColor' }} />
            ) : (
              b.icon
            )}
          </button>
        </Fragment>
      ))}

      {popoverOpen && (
        <div
          ref={popRef}
          className="tb-colorpop"
          role="radiogroup"
          aria-label="Box color"
          onKeyDown={onPopKeyDown}
        >
          {COLOR_SWATCHES.map(({ label, color }, i) => (
            <button
              key={color}
              className="tb-sw"
              type="button"
              role="radio"
              aria-checked={node.color === color}
              tabIndex={i === popFocusIdx ? 0 : -1}
              aria-label={label}
              title={label}
              style={{ background: color }}
              onClick={() => applyColor(color)}
            />
          ))}
          <button
            className="tb-sw tb-sw-reset"
            type="button"
            role="radio"
            aria-checked={!node.color}
            tabIndex={popFocusIdx === COLOR_SWATCHES.length ? 0 : -1}
            aria-label="Use style color"
            title="Use style color"
            onClick={() => applyColor(undefined)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
