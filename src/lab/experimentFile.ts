import { parseConfig, type LabConfig } from './config'

export const FILE_FORMAT = 'pi-infinite-lab/experiment'
/**
 * 2 (v0.3): the high-precision C used by constMod (Pi Rotation) is always 120 decimals.
 * 1 (v0.2): C came from the chosen precision's digits (fewer than 120 below precision 120).
 */
export const FILE_VERSION = 2
export const SUPPORTED_VERSIONS = [1, 2] as const

/**
 * Reproducible experiment record (JSON export, spec §28). The config + steps fully determine
 * the geometry; `result.geometrySha256` lets anyone re-run it and verify bit-identical output.
 */
export interface ExperimentFile {
  format: typeof FILE_FORMAT
  version: typeof FILE_VERSION
  createdAt: string
  app: { name: string; version: string }
  config: LabConfig
  steps: number
  constant: { symbol: string; algorithm: string; precision: number }
  /** Human-readable rule, as executed (symbolic forms from the formula AST). */
  formulas: string[]
  result: {
    geometryRecords: number
    geometrySha256: string
    /** Values after the last step (float64, shortest round-trip). */
    finalState: Record<string, number>
  }
  notes: string[]
}

export interface ParsedImport {
  config: LabConfig
  /** Present for full experiment files; absent for bare presets. */
  steps?: number
  expectedDigest?: string
  /** Why a digest from this file may legitimately differ today (older format), if it may. */
  compatibilityNote?: string
}

/** Accepts a full experiment file or a bare preset `{ constant, experiment, parameters }`. */
export function parseImport(text: string): ParsedImport {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('not valid JSON')
  }
  if (typeof json !== 'object' || json === null) throw new Error('JSON must be an object')
  const o = json as Record<string, unknown>
  if (o.format === FILE_FORMAT) {
    if (!(SUPPORTED_VERSIONS as readonly unknown[]).includes(o.version)) {
      throw new Error(`unsupported file version ${String(o.version)}`)
    }
    const steps = o.steps
    if (typeof steps !== 'number' || !Number.isInteger(steps) || steps < 0) throw new Error('invalid steps')
    const result = o.result as Record<string, unknown> | undefined
    const digest = result?.geometrySha256
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest))
      throw new Error('invalid geometrySha256')
    const config = parseConfig(o.config)
    const compatibilityNote =
      o.version === 1 && config.experiment === 'pi-rotation' && config.precision < 120
        ? 'This v0.2 file used fewer than 120 decimals of the constant in Pi Rotation; v0.3 always uses 120, so the geometry can differ.'
        : undefined
    return { config, steps, expectedDigest: digest, compatibilityNote }
  }
  return { config: parseConfig(o) }
}
