import { circleChain } from './circle-chain'
import { renderFormula, withConstantSymbol, type SymbolTable } from './core/formula'
import type { ExperimentDefinition } from './core/types'
import { digitCircleWalk } from './digit-circle-walk'
import { piRotation } from './pi-rotation'
import { makePlaygroundDefinition, playground, PLAYGROUND_ID, type PlaygroundSources } from './playground'
import { twoArm } from './two-arm'
import { twoArmHeight, twoArmSphere, twoArmTorus } from './two-arm-3d'

/** Available experiments, in display order. */
export const EXPERIMENTS: Record<string, ExperimentDefinition> = {
  [digitCircleWalk.id]: digitCircleWalk,
  [circleChain.id]: circleChain,
  [piRotation.id]: piRotation,
  [twoArm.id]: twoArm,
  [playground.id]: playground,
  [twoArmSphere.id]: twoArmSphere,
  [twoArmTorus.id]: twoArmTorus,
  [twoArmHeight.id]: twoArmHeight,
}

export function getExperiment(id: string): ExperimentDefinition {
  if (!Object.hasOwn(EXPERIMENTS, id)) throw new Error(`Unknown experiment "${id}"`)
  return EXPERIMENTS[id]!
}

let cachedPlayground: { key: string; def: ExperimentDefinition } | null = null

/**
 * The definition that is actually run: the registry entry, or for the Formula Playground the
 * one built from the user's formulas (throws if they do not parse).
 */
export function resolveExperiment(id: string, formulas?: PlaygroundSources): ExperimentDefinition {
  if (id !== PLAYGROUND_ID || !formulas) return getExperiment(id)
  const key = JSON.stringify([formulas.angle, formulas.radius, formulas.distance])
  if (cachedPlayground?.key !== key) cachedPlayground = { key, def: makePlaygroundDefinition(formulas) }
  return cachedPlayground.def
}

/** Description with the constant's symbol substituted for "{C}". */
export function describe(def: ExperimentDefinition, symbol: string): string {
  return def.description.replaceAll('{C}', symbol)
}

/** Display symbols of an experiment with `C` bound to the constant's symbol. */
export function displaySymbols(def: ExperimentDefinition, constantSymbol: string): SymbolTable {
  return withConstantSymbol(def.symbols, constantSymbol)
}

/** The experiment's rule as display lines, e.g. "angle = digit / 10 × 2π" (UI and exports). */
export function formulaLines(def: ExperimentDefinition, constantSymbol: string): string[] {
  const symbols = displaySymbols(def, constantSymbol)
  return def.formulas.map((f) => renderFormula(f, symbols))
}
