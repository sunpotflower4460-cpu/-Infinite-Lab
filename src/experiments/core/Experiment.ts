import { evaluate, explainFormula, type Env, type FormulaSet, type SymbolTable } from './formula'
import type { ParamValues, TraceSink } from './types'

/**
 * Evaluate an experiment's formula set on `env` (mutated in place).
 * When `trace` is given, each formula is also rendered with its inputs substituted.
 * This is the only path by which experiments compute numbers from digits.
 */
export function runFormulas(set: FormulaSet, env: Env, symbols: SymbolTable, trace?: TraceSink): Env {
  for (const f of set) {
    if (trace) {
      const before = { ...env }
      const value = evaluate(f.expr, env)
      env[f.target] = value
      trace.push(explainFormula(f, before, value, symbols))
    } else {
      env[f.target] = evaluate(f.expr, env)
    }
  }
  return env
}

/** Numeric parameters as formula variables (booleans become 1 / 0). */
export function paramsToEnv(params: ParamValues): Env {
  const env: Env = {}
  for (const [k, value] of Object.entries(params))
    env[k] = typeof value === 'boolean' ? (value ? 1 : 0) : value
  return env
}
