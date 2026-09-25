import { circleChain } from './circle-chain'
import { renderFormula, withConstantSymbol, type SymbolTable } from './core/formula'
import type { ExperimentDefinition } from './core/types'
import { digitCircleWalk } from './digit-circle-walk'
import { piRotation } from './pi-rotation'
import { twoArm } from './two-arm'

/** Available experiments, in display order. */
export const EXPERIMENTS: Record<string, ExperimentDefinition> = {
  [digitCircleWalk.id]: digitCircleWalk,
  [circleChain.id]: circleChain,
  [piRotation.id]: piRotation,
  [twoArm.id]: twoArm,
}

export function getExperiment(id: string): ExperimentDefinition {
  if (!Object.hasOwn(EXPERIMENTS, id)) throw new Error(`Unknown experiment "${id}"`)
  return EXPERIMENTS[id]!
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
