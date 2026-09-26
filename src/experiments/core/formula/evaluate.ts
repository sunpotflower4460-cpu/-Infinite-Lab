import { detCos, detSin } from '../../../math/detmath'
import { constantProductMod, productModTau, type BinaryConstant } from '../../../math/exactReduce'
import type { Expr, FormulaSet } from './ast'

/**
 * Numeric environment. Geometry is evaluated in IEEE-754 float64; π inside formulas is the
 * float64 nearest to π (3.141592653589793). This is stated in the UI and docs — the
 * high-precision π digits drive the *inputs* (digits), the rule itself runs in float64.
 */
export type Env = Record<string, number>

export const FLOAT64_PI = Math.PI

/** Extra evaluation context: the selected constant in high precision (for `constMod`). */
export interface EvalContext {
  constant?: BinaryConstant
  /** π in high precision (for `modTau`). */
  pi?: BinaryConstant
}

export function evaluate(e: Expr, env: Env, ctx: EvalContext = {}): number {
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
      return -evaluate(e.arg, env, ctx)
    case 'constMod': {
      if (!ctx.constant) throw new Error('constMod needs the high-precision constant')
      return constantProductMod(
        e.factors.map((f) => evaluate(f, env, ctx)),
        ctx.constant,
        e.modulus,
      )
    }
    case 'modTau': {
      if (!ctx.pi || (e.withConstant && !ctx.constant))
        throw new Error('modTau needs π (and C) in high precision')
      return productModTau(
        e.factors.map((f) => evaluate(f, env, ctx)),
        e.withConstant ? ctx.constant! : null,
        ctx.pi,
      )
    }
    case 'call': {
      const a = evaluate(e.arg, env, ctx)
      return e.fn === 'sin' ? detSin(a) : detCos(a)
    }
    case 'bin': {
      const l = evaluate(e.left, env, ctx)
      const r = evaluate(e.right, env, ctx)
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
export function evaluateSet(set: FormulaSet, env: Env, ctx: EvalContext = {}): Env {
  for (const f of set) env[f.target] = evaluate(f.expr, env, ctx)
  return env
}
