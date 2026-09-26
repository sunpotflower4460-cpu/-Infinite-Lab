/**
 * A tiny expression language used to define experiment rules.
 *
 * Experiments never compute their geometry with hand-written JS arithmetic; they evaluate
 * these expression trees. The same tree is rendered in the Inspector, so the formula the
 * user reads is — structurally — the formula that was executed.
 */
export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'pi' }
  | { kind: 'bin'; op: BinOp; left: Expr; right: Expr }
  | { kind: 'neg'; arg: Expr }
  | { kind: 'call'; fn: FnName; arg: Expr }
  /**
   * (f₁ × … × fₖ × C) mod m with C = the selected constant in high precision.
   * Evaluated exactly in BigInt (see math/exactReduce.ts); only the result is float64.
   */
  | { kind: 'constMod'; factors: Expr[]; modulus: number }
  /**
   * (f₁ × … × fₖ [× C]) mod 2π, evaluated exactly in BigInt (π and C to ≈ 120 decimals).
   */
  | { kind: 'modTau'; factors: Expr[]; withConstant: boolean }

export type BinOp = '+' | '-' | '*' | '/' | 'mod'
export type FnName = 'sin' | 'cos'

/** One assignment `target = expr`, evaluated in order within a FormulaSet. */
export interface Formula {
  target: string
  expr: Expr
  /** Optional short description shown next to the formula. */
  note?: string
}

export type FormulaSet = readonly Formula[]

// Builders -----------------------------------------------------------------

export const num = (value: number): Expr => ({ kind: 'num', value })
export const v = (name: string): Expr => ({ kind: 'var', name })
export const PI: Expr = { kind: 'pi' }
const bin =
  (op: BinOp) =>
  (left: Expr, right: Expr): Expr => ({ kind: 'bin', op, left, right })
export const add = bin('+')
export const sub = bin('-')
export const mul = bin('*')
export const div = bin('/')
export const mod = bin('mod')
export const neg = (arg: Expr): Expr => ({ kind: 'neg', arg })
export const sin = (arg: Expr): Expr => ({ kind: 'call', fn: 'sin', arg })
export const cos = (arg: Expr): Expr => ({ kind: 'call', fn: 'cos', arg })
export const constMod = (factors: Expr[], modulus: number): Expr => ({ kind: 'constMod', factors, modulus })
export const modTau = (factors: Expr[], withConstant = false): Expr => ({
  kind: 'modTau',
  factors,
  withConstant,
})
export const assign = (target: string, expr: Expr, note?: string): Formula => ({ target, expr, note })

/** All variable names referenced by an expression. */
export function freeVars(e: Expr, out = new Set<string>()): Set<string> {
  switch (e.kind) {
    case 'var':
      out.add(e.name)
      break
    case 'bin':
      freeVars(e.left, out)
      freeVars(e.right, out)
      break
    case 'neg':
    case 'call':
      freeVars(e.arg, out)
      break
    case 'constMod':
    case 'modTau':
      for (const f of e.factors) freeVars(f, out)
      break
  }
  return out
}
