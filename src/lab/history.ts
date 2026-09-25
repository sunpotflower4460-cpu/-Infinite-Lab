import { parseConfig, type LabConfig } from './config'

export interface HistoryEntry {
  id: string
  timestamp: string
  config: LabConfig
  steps: number
  /** SHA-256 of the geometry at `steps` (see geometry/digest.ts). */
  digest?: string
}

export const HISTORY_KEY = 'pi-infinite-lab.history.v1'
export const HISTORY_LIMIT = 50

/** Minimal storage interface (window.localStorage in the app, a stub in tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Read history; invalid or foreign entries are dropped rather than trusted. */
export function loadHistory(storage: KeyValueStorage | undefined): HistoryEntry[] {
  try {
    const raw = storage?.getItem(HISTORY_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return []
    const out: HistoryEntry[] = []
    for (const item of list) {
      try {
        const e = item as Record<string, unknown>
        if (typeof e.id !== 'string' || typeof e.timestamp !== 'string') continue
        if (typeof e.steps !== 'number' || !Number.isInteger(e.steps) || e.steps < 0) continue
        out.push({
          id: e.id,
          timestamp: e.timestamp,
          config: parseConfig(e.config),
          steps: e.steps,
          digest: typeof e.digest === 'string' ? e.digest : undefined,
        })
      } catch {
        // skip invalid entry
      }
    }
    return out
  } catch {
    return []
  }
}

/** Prepend an entry (newest first) and persist. Returns the new list. */
export function addHistory(storage: KeyValueStorage | undefined, entry: HistoryEntry): HistoryEntry[] {
  const list = [entry, ...loadHistory(storage)].slice(0, HISTORY_LIMIT)
  save(storage, list)
  return list
}

export function removeHistory(storage: KeyValueStorage | undefined, id: string): HistoryEntry[] {
  const list = loadHistory(storage).filter((e) => e.id !== id)
  save(storage, list)
  return list
}

function save(storage: KeyValueStorage | undefined, list: HistoryEntry[]): void {
  try {
    storage?.setItem(HISTORY_KEY, JSON.stringify(list))
  } catch {
    // storage full or unavailable: history is a convenience, never required
  }
}

export function browserStorage(): KeyValueStorage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
