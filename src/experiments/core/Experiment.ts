import {
  evaluate,
  explainFormula,
  withConstantSymbol,
  type Env,
  type EvalContext,
  type FormulaSet,
  type SymbolTable,
} from './formula'
import type { ParamValues, StepContext, TraceSink } from './types'

/**
 * Evaluate an experiment's formula set on `env` (mutated in place).
 * When `trace` is given, each formula is also rendered with its inputs substituted.
 * This is the only path by which experiments compute numbers from digits.
 */
export function runFormulas(
  set: FormulaSet,
  env: Env,
  symbols: SymbolTable,
  trace?: TraceSink,
  ctx: EvalContext = {},
): Env {
  for (const f of set) {
    if (trace) {
      const before = { ...env }
      const value = evaluate(f.expr, env, ctx)
      env[f.target] = value
      trace.push(explainFormula(f, before, value, symbols))
    } else {
      env[f.target] = evaluate(f.expr, env, ctx)
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

/** Symbol table for traces: the experiment's symbols plus `C` = the constant's symbol. */
export function traceSymbols(symbols: SymbolTable, ctx: StepContext): SymbolTable {
  return withConstantSymbol(symbols, ctx.constant.symbol)
}
