import { describe, expect, it } from 'vitest'
import {
  add,
  assign,
  cos,
  div,
  evaluate,
  explainFormula,
  mod,
  mul,
  neg,
  num,
  PI,
  renderExpr,
  sub,
  v,
} from '../../../src/experiments/core/formula'
import { detCos } from '../../../src/math/detmath'

describe('formula rendering', () => {
  it('renders the Digit Circle Walk angle as in the specification', () => {
    const angle = mul(div(v('digit'), num(10)), mul(num(2), PI))
    expect(renderExpr(angle)).toBe('digit / 10 × 2π')
    expect(renderExpr(angle, { values: { digit: 7 } })).toBe('7 / 10 × 2π')
  })

  it('parenthesises by precedence and associativity', () => {
    expect(renderExpr(mul(add(v('a'), v('b')), v('c')))).toBe('(a + b) × c')
    expect(renderExpr(sub(v('a'), sub(v('b'), v('c'))))).toBe('a − (b − c)')
    expect(renderExpr(div(v('a'), mul(v('b'), v('c'))))).toBe('a / (b × c)')
    expect(renderExpr(neg(add(v('a'), num(1))))).toBe('−(a + 1)')
    expect(renderExpr(cos(v('t')))).toBe('cos(t)')
    expect(renderExpr(mod(v('t'), mul(num(2), PI)))).toBe('t mod 2π')
  })

  it('wraps negative substituted values', () => {
    expect(renderExpr(add(v('x'), num(1)), { values: { x: -2.5 } })).toBe('(-2.5) + 1')
  })

  it('uses symbol tables', () => {
    expect(renderExpr(v('x_prev'), { symbols: { x_prev: 'x[n−1]' } })).toBe('x[n−1]')
  })
})

describe('formula evaluation', () => {
  it('computes digit / 10 × 2π in float64', () => {
    const angle = mul(div(v('digit'), num(10)), mul(num(2), PI))
    expect(evaluate(angle, { digit: 7 })).toBe((7 / 10) * (2 * Math.PI))
    expect(evaluate(angle, { digit: 7 })).toBeCloseTo(4.39822971502571, 15)
  })

  it('uses deterministic cos', () => {
    expect(evaluate(cos(v('t')), { t: 1.234 })).toBe(detCos(1.234))
  })

  it('mod is non-negative', () => {
    expect(evaluate(mod(num(-1), num(3)), {})).toBe(2)
  })

  it('throws on unbound variables instead of guessing', () => {
    expect(() => evaluate(v('nope'), {})).toThrow(/Unbound/)
  })

  it('explanation value equals the executed value', () => {
    const f = assign('angle', mul(div(v('digit'), num(10)), mul(num(2), PI)))
    const env = { digit: 9 }
    const value = evaluate(f.expr, env)
    const ex = explainFormula(f, env, value)
    expect(ex.symbolic).toBe('angle = digit / 10 × 2π')
    expect(ex.substituted).toBe('9 / 10 × 2π')
    expect(ex.value).toBe(value)
  })
})
