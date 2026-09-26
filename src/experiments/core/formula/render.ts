import type { BinOp, Expr, Formula } from './ast'

/** Display symbols for variables (e.g. "x_prev" → "xₙ₋₁"). Unknown names render as-is. */
export type SymbolTable = Record<string, string>

const PRECEDENCE: Record<BinOp, number> = { '+': 1, '-': 1, '*': 2, '/': 2, mod: 2 }
const OP_TEXT: Record<BinOp, string> = { '+': ' + ', '-': ' − ', '*': ' × ', '/': ' / ', mod: ' mod ' }

export type ValueFormatter = (value: number) => string

/** Shortest decimal that round-trips to the same float64 — nothing hidden, nothing invented. */
export const exactFloat: ValueFormatter = (x) => (Object.is(x, -0) ? '-0' : String(x))

interface RenderOptions {
  symbols?: SymbolTable
  /** When given, variables are replaced by their values. */
  values?: Record<string, number>
  format?: ValueFormatter
}

function prec(e: Expr): number {
  if (e.kind === 'bin') return PRECEDENCE[e.op]
  if (e.kind === 'neg') return 3
  return 4
}

function isImplicitProduct(e: Expr & { kind: 'bin' }): boolean {
  // "2π" rather than "2 × π"
  return e.op === '*' && e.left.kind === 'num' && e.right.kind === 'pi'
}

export function renderExpr(e: Expr, opts: RenderOptions = {}): string {
  const fmt = opts.format ?? exactFloat
  const go = (x: Expr): string => {
    switch (x.kind) {
      case 'num':
        return fmt(x.value)
      case 'pi':
        return 'π'
      case 'var': {
        const value = opts.values?.[x.name]
        if (value !== undefined) return value < 0 ? `(${fmt(value)})` : fmt(value)
        return opts.symbols?.[x.name] ?? x.name
      }
      case 'neg':
        return `−${wrap(x.arg, 3, false)}`
      case 'call':
        return `${x.fn}(${go(x.arg)})`
      case 'modTau':
        return `(${[...x.factors.map((f) => wrap(f, 2, false)), ...(x.withConstant ? [opts.symbols?.C ?? 'C'] : [])].join(' × ')}) mod 2π`
      case 'constMod':
        return `(${[...x.factors.map((f) => wrap(f, 2, false)), opts.symbols?.C ?? 'C'].join(' × ')}) mod ${fmt(x.modulus)}`
      case 'bin': {
        if (isImplicitProduct(x)) return `${go(x.left)}π`
        const p = PRECEDENCE[x.op]
        // Left-associative: the right operand needs parentheses at equal precedence for − and /.
        const rightStrict = x.op === '-' || x.op === '/' || x.op === 'mod'
        return wrap(x.left, p, false) + OP_TEXT[x.op] + wrap(x.right, p, rightStrict)
      }
    }
  }
  const wrap = (x: Expr, parentPrec: number, strict: boolean): string => {
    const inner = go(x)
    const cp = x.kind === 'bin' && isImplicitProduct(x) ? 4 : prec(x)
    return cp < parentPrec || (strict && cp === parentPrec) ? `(${inner})` : inner
  }
  return go(e)
}

/** Symbol table with `C` bound to the constant's symbol (π, e, √2, φ). */
export function withConstantSymbol(symbols: SymbolTable, constantSymbol: string): SymbolTable {
  return { ...symbols, C: constantSymbol }
}

/** "target = expression" as displayed in the UI and written to exports. */
export function renderFormula(f: Formula, symbols?: SymbolTable): string {
  return `${symbols?.[f.target] ?? f.target} = ${renderExpr(f.expr, { symbols })}`
}

export interface FormulaEvaluation {
  target: string
  /** Symbolic form, e.g. "angle = digit / 10 × 2π". */
  symbolic: string
  /** With inputs substituted, e.g. "7 / 10 × 2π". */
  substituted: string
  /** Result as float64. */
  value: number
  note?: string
}

/**
 * Render a formula symbolically and with the given environment substituted.
 * `envBefore` must be the environment *before* this formula was evaluated.
 */
export function explainFormula(
  f: Formula,
  envBefore: Record<string, number>,
  value: number,
  symbols?: SymbolTable,
): FormulaEvaluation {
  return {
    target: f.target,
    symbolic: renderFormula(f, symbols),
    substituted: renderExpr(f.expr, { symbols, values: envBefore }),
    value,
    note: f.note,
  }
}
