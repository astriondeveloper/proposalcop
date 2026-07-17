import type { OrgChart } from './model'

/* Export helpers: standalone SVG, high-DPI PNG, and chart JSON. */

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function safeName(title: string): string {
  return (title.trim() || 'org-chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function svgMarkup(svgEl: SVGSVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('style')
  // Strip editor-only decorations (e.g. the selection outline).
  clone.querySelectorAll('[data-ui]').forEach((el) => el.remove())
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
}

export function exportSvg(svgEl: SVGSVGElement, title: string): void {
  download(new Blob([svgMarkup(svgEl)], { type: 'image/svg+xml' }), `${safeName(title)}.svg`)
}

/** Rasterize the chart SVG onto a white canvas at the given scale. Returns the
 *  canvas plus the chart's native (unscaled) pixel size, for callers that need
 *  the aspect ratio or raw pixels (PPTX / PDF export). */
export function svgToCanvas(
  svgEl: SVGSVGElement,
  scale: number,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const width = svgEl.viewBox.baseVal.width || svgEl.clientWidth
    const height = svgEl.viewBox.baseVal.height || svgEl.clientHeight
    const svgBlob = new Blob([svgMarkup(svgEl)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas unavailable'))
        return
      }
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve({ canvas, width, height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG rasterization failed'))
    }
    img.src = url
  })
}

/** Rasterize the chart SVG to a PNG blob plus its native size. */
export function svgToPngBlob(
  svgEl: SVGSVGElement,
  scale: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  return svgToCanvas(svgEl, scale).then(
    ({ canvas, width, height }) =>
      new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve({ blob, width, height })
          else reject(new Error('PNG encoding failed'))
        }, 'image/png')
      }),
  )
}

export function exportPng(svgEl: SVGSVGElement, title: string, scale: number): Promise<void> {
  return svgToPngBlob(svgEl, scale).then(({ blob }) => {
    download(blob, `${safeName(title)}@${scale}x.png`)
  })
}

export function exportJson(chart: OrgChart): void {
  download(
    new Blob([JSON.stringify(chart, null, 2)], { type: 'application/json' }),
    `${safeName(chart.meta.title)}.json`,
  )
}

/** Download a library pack (or any JSON value) as a `.json` file. */
export function exportLibraryPack(pack: unknown, name = 'proposal-cop-library'): void {
  download(
    new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }),
    `${safeName(name)}.json`,
  )
}

/** Download prebuilt CSV text as `<title>-<suffix>.csv`. */
export function exportCsv(csv: string, title: string, suffix = 'compliance'): void {
  download(
    new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }),
    `${safeName(title)}-${suffix}.csv`,
  )
}

const SLIDE_DIMS = {
  '16:9': { w: 1920, h: 1080 },
  '4:3': { w: 1440, h: 1080 },
} as const

/** Export a PNG sized to a PowerPoint slide: the chart is scaled to fit with a
 *  margin and centered on a white slide-shaped canvas, so it drops onto a slide
 *  at the right aspect ratio without further resizing. */
export function exportSlidePng(
  svgEl: SVGSVGElement,
  title: string,
  ratio: keyof typeof SLIDE_DIMS = '16:9',
): Promise<void> {
  const dims = SLIDE_DIMS[ratio]
  const margin = 72
  const nativeW = svgEl.viewBox.baseVal.width || svgEl.clientWidth
  const nativeH = svgEl.viewBox.baseVal.height || svgEl.clientHeight
  const fit = Math.min((dims.w - margin * 2) / nativeW, (dims.h - margin * 2) / nativeH)
  const scale = Math.max(0.1, Math.min(6, fit))
  return svgToCanvas(svgEl, scale).then(
    ({ canvas }) =>
      new Promise((resolve, reject) => {
        const slide = document.createElement('canvas')
        slide.width = dims.w
        slide.height = dims.h
        const ctx = slide.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas unavailable'))
          return
        }
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, dims.w, dims.h)
        ctx.drawImage(canvas, Math.round((dims.w - canvas.width) / 2), Math.round((dims.h - canvas.height) / 2))
        slide.toBlob((blob) => {
          if (blob) {
            download(blob, `${safeName(title)}-slide-${ratio.replace(':', 'x')}.png`)
            resolve()
          } else {
            reject(new Error('PNG encoding failed'))
          }
        }, 'image/png')
      }),
  )
}
