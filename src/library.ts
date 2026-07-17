import type { OrgChart } from './model'
import { clone, normalizeChart, uid } from './model'

/* Reuse library — a file-based, zero-backend way to share approved starting
 * points. A "library pack" is a JSON bundle of chart entries that a team keeps
 * in a shared folder (e.g. SharePoint); anyone imports it and its entries join
 * their local library and the template picker. Every entry's chart is run
 * through normalizeChart, so the library can only hold valid, brand-locked
 * charts — that is the governance point. */

export interface LibraryEntry {
  id: string
  name: string
  description?: string
  /** Marks an entry as an organization-approved starting point. */
  approved?: boolean
  /** ISO timestamp of when the entry was captured (display only). */
  updatedAt?: string
  chart: OrgChart
}

export const LIBRARY_KIND = 'proposalcop-library'

export interface LibraryPack {
  kind: typeof LIBRARY_KIND
  version: 1
  entries: LibraryEntry[]
}

export function isLibraryPack(v: unknown): v is LibraryPack {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as LibraryPack).kind === LIBRARY_KIND &&
    Array.isArray((v as LibraryPack).entries)
  )
}

/**
 * Validate and normalize library entries from untrusted input (a pack file or
 * localStorage). Accepts either a raw entry array or a full pack. Each chart is
 * run through normalizeChart; entries whose chart is invalid are dropped, and
 * ids / names are filled in. Never throws.
 */
export function normalizeLibrary(input: unknown): LibraryEntry[] {
  const raw = Array.isArray(input) ? input : isLibraryPack(input) ? input.entries : []
  const out: LibraryEntry[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const src = e as Partial<LibraryEntry>
    let chart: OrgChart
    try {
      chart = normalizeChart(src.chart)
    } catch {
      continue
    }
    const name =
      typeof src.name === 'string' && src.name.trim() ? src.name.trim() : chart.meta.title || 'Untitled'
    const id = typeof src.id === 'string' && src.id ? src.id : uid('lib')
    const entry: LibraryEntry = { id, name, chart }
    if (typeof src.description === 'string' && src.description.trim()) {
      entry.description = src.description.trim()
    }
    if (src.approved === true) entry.approved = true
    if (typeof src.updatedAt === 'string' && src.updatedAt) entry.updatedAt = src.updatedAt
    out.push(entry)
  }
  return out
}

export function makePack(entries: LibraryEntry[]): LibraryPack {
  return { kind: LIBRARY_KIND, version: 1, entries }
}

/** Merge incoming entries into existing, de-duplicated by id (incoming wins). */
export function mergeLibrary(existing: LibraryEntry[], incoming: LibraryEntry[]): LibraryEntry[] {
  const byId = new Map(existing.map((e) => [e.id, e]))
  for (const e of incoming) byId.set(e.id, e)
  return [...byId.values()]
}

/** Capture a chart as a fresh library entry (deep-copied, fresh id). */
export function entryFromChart(
  chart: OrgChart,
  name: string,
  opts?: { description?: string; approved?: boolean; updatedAt?: string },
): LibraryEntry {
  const entry: LibraryEntry = {
    id: uid('lib'),
    name: name.trim() || chart.meta.title || 'Untitled',
    chart: clone(chart),
  }
  if (opts?.description?.trim()) entry.description = opts.description.trim()
  if (opts?.approved) entry.approved = true
  if (opts?.updatedAt) entry.updatedAt = opts.updatedAt
  return entry
}
