import { detCos, detSin } from '../../../math/detmath'
import type { Expr, FormulaSet } from './ast'

/**
 * Numeric environment. Geometry is evaluated in IEEE-754 float64; π inside formulas is the
 * float64 nearest to π (3.141592653589793). This is stated in the UI and docs — the
 * high-precision π digits drive the *inputs* (digits), the rule itself runs in float64.
 */
export type Env = Record<string, number>

export const FLOAT64_PI = Math.PI

export function evaluate(e: Expr, env: Env): number {
  switch (e.kind) {
    case 'num':
      return e.value
    case 'pi':
      return FLOAT64_PI
    case 'var': {
      const value = env[e.name]
      if (value === undefined) throw new Error(`Unbound variable "${e.name}"`)
      return value
    }
    case 'neg':
      return -evaluate(e.arg, env)
    case 'call': {
      const a = evaluate(e.arg, env)
      return e.fn === 'sin' ? detSin(a) : detCos(a)
    }
    case 'bin': {
      const l = evaluate(e.left, env)
      const r = evaluate(e.right, env)
      switch (e.op) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case '/':
          return l / r
        case 'mod': {
          const m = l % r // exact in IEEE-754
          return m < 0 ? m + r : m
        }
      }
    }
  }
}

/** Evaluate formulas in order; each result is written back into `env` under its target name. */
export function evaluateSet(set: FormulaSet, env: Env): Env {
  for (const f of set) env[f.target] = evaluate(f.expr, env)
  return env
}
