import { describe, expect, it } from 'vitest'
import {
  add,
  constMod,
  cos,
  div,
  evaluate,
  FormulaSyntaxError,
  mod,
  modTau,
  mul,
  neg,
  num,
  parseExpr,
  PI,
  renderExpr,
  sub,
  v,
  type Expr,
} from '../../../src/experiments/core/formula'
import { binaryConstantFor } from '../../../src/math/exactReduce'
import { COMPUTE_SYNC } from '../../../src/math/constants'

const VARS = ['n', 'digit', 'angle_prev', 'dt']
const parse = (s: string) => parseExpr(s, { variables: VARS, allowConstant: true })
const ctx = {
  constant: binaryConstantFor('e', COMPUTE_SYNC.e!),
  pi: binaryConstantFor('pi', COMPUTE_SYNC.pi!),
}

function errorOf(s: string): FormulaSyntaxError {
  try {
    parse(s)
  } catch (err) {
    if (err instanceof FormulaSyntaxError) return err
    throw err
  }
  throw new Error(`"${s}" parsed without error`)
}

describe('parseExpr', () => {
  it('parses the spec example with the usual precedence', () => {
    expect(parse('digit × π / 5')).toEqual(div(mul(v('digit'), PI), num(5)))
    expect(parse('digit * pi / 5')).toEqual(parse('digit × π / 5'))
    expect(parse('digit · π ÷ 5')).toEqual(parse('digit × π / 5'))
    expect(parse('1 + 2 × 3')).toEqual(add(num(1), mul(num(2), num(3))))
    expect(parse('(1 + 2) × 3')).toEqual(mul(add(num(1), num(2)), num(3)))
    expect(parse('1 − 2 − 3')).toEqual(sub(sub(num(1), num(2)), num(3)))
    expect(parse('7 % 3')).toEqual(mod(num(7), num(3)))
    expect(parse('7 mod 3')).toEqual(mod(num(7), num(3)))
    expect(parse('cos(n)')).toEqual(cos(v('n')))
    expect(parse('abs(-2.5)')).toEqual({ kind: 'call', fn: 'abs', arg: num(-2.5) })
    expect(parse('sqrt(digit)')).toEqual({ kind: 'call', fn: 'sqrt', arg: v('digit') })
  })

  it('distinguishes the literal -5 from the negation −5, as they are printed', () => {
    expect(parse('-5')).toEqual(num(-5))
    expect(parse('−5')).toEqual(neg(num(5)))
    expect(parse('- 5')).toEqual(neg(num(5)))
    expect(parse('-n')).toEqual(neg(v('n')))
    expect(parse('2 - -5')).toEqual(sub(num(2), num(-5)))
    expect(parse('−n × 2')).toEqual(mul(neg(v('n')), num(2))) // negation binds tighter than ×
    expect(parse('1e-7')).toEqual(num(1e-7))
    expect(parse('-0')).toEqual(num(-0))
  })

  it('reads a number directly followed by a name as a product ("2π", "3n")', () => {
    expect(parse('2π')).toEqual(mul(num(2), PI))
    expect(parse('digit / 10 × 2π')).toEqual(mul(div(v('digit'), num(10)), mul(num(2), PI)))
    expect(parse('n / 2π')).toEqual(div(v('n'), mul(num(2), PI)))
    expect(parse('3n')).toEqual(mul(num(3), v('n')))
    expect(() => parse('2 π')).toThrow(/missing an operator/)
  })

  it('turns "… mod 2π" into an exact reduction and C into exact constant reductions', () => {
    expect(parse('(n × dt × C) mod 2π')).toEqual(modTau([v('n'), v('dt')], true))
    expect(parse('n × dt mod 2π')).toEqual(modTau([v('n'), v('dt')]))
    expect(parse('(n × C) mod 360')).toEqual(constMod([v('n')], 360))
    expect(parse('(C × n × 0.5) mod 1')).toEqual(constMod([v('n'), num(0.5)], 1))
    expect(parse('(angle_prev + digit) mod 2π')).toEqual(
      mod(add(v('angle_prev'), v('digit')), mul(num(2), PI)),
    )
    expect(parse('angle_prev mod 2π')).toEqual(mod(v('angle_prev'), mul(num(2), PI)))
    expect(parse('C mod 2π')).toEqual(modTau([], true))
    // float mod stays float mod
    expect(parse('n mod 7')).toEqual(mod(v('n'), num(7)))
    // exact: e × 10^12 mod 2π with every digit of e, not with float64 e
    const exact = evaluate(parse('(n × C) mod 2π'), { n: 1e12 }, ctx)
    expect(exact).toBe(evaluate(modTau([v('n')], true), { n: 1e12 }, ctx))
    expect(exact).not.toBe((1e12 * Math.E) % (2 * Math.PI))
  })

  it('reports errors with the character range they refer to', () => {
    const cases: [string, RegExp, number, number][] = [
      ['digit × foo', /unknown name "foo"/, 8, 11],
      ['(digit + 1', /missing "\)"/, 0, 10],
      ['digit )', /unexpected "\)"/, 6, 7],
      ['digit 5', /missing an operator/, 6, 7],
      ['', /empty formula/, 0, 0],
      ['n ^ 2', /powers are not supported/, 2, 3],
      ['n × C', /C can only be used exactly/, 4, 5],
      ['sin(C × n)', /C can only be used exactly/, 4, 5],
      ['(n × π) mod 2π', /π as a factor/, 5, 6],
      ['(C × C × n) mod 2π', /only once/, 5, 6],
      ['(n × C) mod dt', /positive whole number or 2π/, 12, 14],
      ['(n × C) mod -1', /positive whole number or 2π/, 12, 14],
      ['(n × C) mod 7.5', /positive whole number or 2π/, 12, 15],
      ['sin n', /sin needs parentheses/, 0, 5],
      ['n +', /ends too early/, 3, 3],
      ['× n', /needs a value before it/, 0, 1],
      ['n $ 2', /unexpected character "\$"/, 2, 3],
    ]
    for (const [src, message, start, end] of cases) {
      const err = errorOf(src)
      expect(err.message, src).toMatch(message)
      expect([err.start, err.end], src).toEqual([start, end])
    }
    expect(() => parseExpr('C mod 2π', { variables: [] })).toThrow(/not available/)
    expect(() => parse('('.repeat(100) + 'n' + ')'.repeat(100))).toThrow(/nested too deeply/)
    expect(() => parse('n + '.repeat(120) + 'n')).toThrow(/longer than/)
  })
})

// ---- round trip: the text shown for a formula executes as that formula ----------------------

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** Random trees of the shapes the parser produces (see parse.ts for the exact-reduction rules). */
function randomExpr(r: () => number, depth: number): Expr {
  const leaf = (): Expr => {
    const k = Math.floor(r() * 5)
    if (k === 0) return v(VARS[Math.floor(r() * VARS.length)]!)
    if (k === 1) return PI
    if (k === 2) return mul(num(Math.floor(r() * 7) - 3), PI) // "2π", "-3π"
    const x = (r() - 0.3) * 10 ** Math.floor(r() * 12 - 6)
    return num(k === 3 ? Math.round(x * 100) / 100 : x)
  }
  if (depth <= 0) return leaf()
  const sub1 = () => randomExpr(r, depth - 1)
  const factor = (): Expr => {
    const f = sub1()
    return (f.kind === 'bin' && f.op === '*') || f.kind === 'pi' ? v('n') : f
  }
  const factors = () => Array.from({ length: 1 + Math.floor(r() * 3) }, factor)
  switch (Math.floor(r() * 10)) {
    case 0:
      return leaf()
    case 1:
      return neg(sub1())
    case 2:
      return { kind: 'call', fn: (['sin', 'cos', 'abs', 'sqrt'] as const)[Math.floor(r() * 4)]!, arg: sub1() }
    case 3:
      return r() < 0.5 ? modTau(factors(), true) : modTau([factor(), ...factors()]) // ≥ 2 factors without C
    case 4:
      return constMod(factors(), [360, 1, 7][Math.floor(r() * 3)]!)
    default: {
      const op = (['+', '-', '*', '/', 'mod'] as const)[Math.floor(r() * 5)]!
      let right = sub1()
      if (op === 'mod' && right.kind === 'bin' && right.op === '*' && right.right.kind === 'pi')
        right = num(3)
      return { kind: 'bin', op, left: sub1(), right }
    }
  }
}

describe('render ↔ parse', () => {
  it('the rendered text parses back to a tree that computes the same float64, bit for bit', () => {
    const r = rng(20260926)
    for (let i = 0; i < 3000; i++) {
      const a = randomExpr(r, 1 + (i % 5))
      const text = renderExpr(a)
      const b = parseExpr(text, { variables: VARS, allowConstant: true, maxLength: Infinity })
      expect(renderExpr(b), text).toBe(text)
      expect(
        parseExpr(renderExpr(b), { variables: VARS, allowConstant: true, maxLength: Infinity }),
        text,
      ).toEqual(b)
      for (let k = 0; k < 3; k++) {
        const env = { n: Math.floor(r() * 1e6), digit: Math.floor(r() * 10), angle_prev: r() * 7, dt: r() }
        const va = outcome(() => evaluate(a, env, ctx))
        const vb = outcome(() => evaluate(b, env, ctx))
        expect(vb, `${text} @ ${JSON.stringify(env)}`).toEqual(va)
      }
    }
  })

  it('the rendered text of every built-in experiment parses back to its executed tree', async () => {
    const { EXPERIMENTS } = await import('../../../src/experiments/registry')
    for (const def of Object.values(EXPERIMENTS)) {
      for (const f of def.formulas) {
        const vars = [...collectVars(f.expr)]
        const text = renderExpr(f.expr)
        const back = parseExpr(text, { variables: vars, allowConstant: true })
        expect(normalise(back), `${def.id}: ${f.target} = ${text}`).toEqual(normalise(f.expr))
      }
    }
  })
})

/** Value (bits compared via Object.is in toEqual) or the error a step would stop with. */
function outcome(f: () => number): number | string {
  try {
    return f()
  } catch (err) {
    return `error: ${String(err)}`
  }
}

function collectVars(e: Expr, out = new Set<string>()): Set<string> {
  if (e.kind === 'var') out.add(e.name)
  if (e.kind === 'bin') {
    collectVars(e.left, out)
    collectVars(e.right, out)
  }
  if (e.kind === 'neg' || e.kind === 'call') collectVars(e.arg, out)
  if (e.kind === 'modTau' || e.kind === 'constMod') e.factors.forEach((f) => collectVars(f, out))
  return out
}

/** Drop undefined-valued keys (builders never set optional fields). */
function normalise(e: Expr): unknown {
  return JSON.parse(JSON.stringify(e))
}
