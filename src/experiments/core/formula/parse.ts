import type { Expr, FnName } from './ast'

/**
 * Parser for user-written formulas (Experimental Playground, spec §10).
 *
 * It emits only the existing AST nodes, so a parsed formula is evaluated, traced and
 * displayed exactly like the built-in experiments (display = execution). Rendering a
 * parsed tree with `renderExpr` and parsing the text again gives the same tree.
 *
 * Grammar (whitespace is free except inside numbers and implicit products):
 *
 *   expr    := term (('+' | '-' | '−') term)*
 *   term    := unary (('×' | '*' | '·' | '/' | '÷' | 'mod' | '%') unary)*
 *   unary   := ('−' | '-') unary | primary          // "-5" directly before a number = literal
 *   primary := number [name | 'π']                   // "2π", "3n": number immediately followed
 *            | name | 'π' | 'pi' | fn '(' expr ')' | '(' expr ')'
 *   fn      := 'sin' | 'cos' | 'abs' | 'sqrt'
 *
 * Exact reductions (evaluated in BigInt, see math/exactReduce.ts):
 *
 *   (f × g × …) mod 2π    → modTau([f, g, …])             a product of two or more factors
 *   (f × … × C) mod 2π    → modTau([f, …], withConstant)
 *   (f × … × C²) mod 2π   → modTau([f, …], withConstant, squared)   C² = C × C (both exact)
 *   (f × … × C) mod 360   → constMod([f, …], 360)          any positive whole number
 *
 * Any other "x mod 2π" (a sum, a single value) is the ordinary float64 mod with 2π = 2 × fl(π),
 * like every π in a formula — this is how Circle Chain's direction has always been computed.
 *
 * `C` — the selected constant — may appear only as one factor (or C² / C × C in a mod 2π) of such a reduction. Anywhere
 * else it would have to be rounded to float64 first, and n × C loses every digit that makes
 * the constant interesting once n is large, so that is refused with an explanation.
 */

export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    /** Character range [start, end) in the source the message refers to. */
    readonly start: number,
    readonly end: number,
  ) {
    super(message)
    this.name = 'FormulaSyntaxError'
  }
}

export interface ParseOptions {
  /** Variable names the formula may read. */
  variables: readonly string[]
  /** Whether `C` (the selected constant, exact reductions only) is available. */
  allowConstant?: boolean
  /** Longest accepted source (default MAX_SOURCE_LENGTH). */
  maxLength?: number
}

export const FUNCTIONS: readonly FnName[] = ['sin', 'cos', 'abs', 'sqrt']
export const MAX_SOURCE_LENGTH = 400
const MAX_DEPTH = 64
const CONSTANT_MARK = '\u0000C'

type TokenKind = 'num' | 'name' | 'op' | '(' | ')' | 'end'
interface Token {
  kind: TokenKind
  text: string
  start: number
  end: number
  value?: number
}

const OPS: Record<string, string> = {
  '+': '+',
  '-': '-',
  '−': '−',
  '*': '*',
  '×': '*',
  '·': '*',
  '/': '/',
  '÷': '/',
  '%': 'mod',
}

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const start = i
    if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))
      if (!m) throw new FormulaSyntaxError(`"${ch}" does not start a number`, i, i + 1)
      i += m[0].length
      const value = Number(m[0])
      if (!Number.isFinite(value)) throw new FormulaSyntaxError(`${m[0]} is too large`, start, i)
      out.push({ kind: 'num', text: m[0], start, end: i, value })
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!
      i += m[0].length
      out.push({ kind: m[0] === 'mod' ? 'op' : 'name', text: m[0] === 'mod' ? 'mod' : m[0], start, end: i })
    } else if (ch === 'π') {
      i++
      out.push({ kind: 'name', text: 'π', start, end: i })
    } else if (ch === '(' || ch === ')') {
      i++
      out.push({ kind: ch, text: ch, start, end: i })
    } else if (Object.hasOwn(OPS, ch)) {
      i++
      out.push({ kind: 'op', text: OPS[ch]!, start, end: i })
    } else if (ch === '²') {
      // C² = C × C: only the constant may be squared (inside an exact mod 2π reduction)
      const prev = out[out.length - 1]
      if (prev?.kind !== 'name' || prev.text !== 'C')
        throw new FormulaSyntaxError('only the constant can be squared (C²)', i, i + 1)
      i++
      out.push({ kind: 'op', text: OPS['×']!, start, end: i }, { kind: 'name', text: 'C', start, end: i })
    } else if (ch === '^') {
      throw new FormulaSyntaxError('powers are not supported: write the product (x × x)', i, i + 1)
    } else {
      throw new FormulaSyntaxError(`unexpected character "${ch}"`, i, i + 1)
    }
  }
  out.push({ kind: 'end', text: '', start: src.length, end: src.length })
  return out
}

/** Parse one expression. Throws FormulaSyntaxError with the offending character range. */
export function parseExpr(src: string, options: ParseOptions): Expr {
  const maxLength = options.maxLength ?? MAX_SOURCE_LENGTH
  if (src.length > maxLength)
    throw new FormulaSyntaxError(`formula is longer than ${maxLength} characters`, 0, src.length)
  const tokens = tokenize(src)
  if (tokens.length === 1) throw new FormulaSyntaxError('empty formula', 0, src.length)
  const variables = new Set(options.variables)
  /** Source range of every node, for error messages that point at the right place. */
  const where = new WeakMap<Expr, [number, number]>()
  let pos = 0
  let depth = 0

  const peek = () => tokens[pos]!
  const next = () => tokens[pos++]!
  const at = (e: Expr, start: number, end: number): Expr => {
    where.set(e, [start, end])
    return e
  }
  const range = (e: Expr): [number, number] => where.get(e) ?? [0, src.length]
  const isOp = (t: Token, ...ops: string[]) => t.kind === 'op' && ops.includes(t.text)

  function expr(): Expr {
    if (++depth > MAX_DEPTH)
      throw new FormulaSyntaxError('formula is nested too deeply', peek().start, peek().end)
    let left = term()
    while (isOp(peek(), '+', '-', '−')) {
      const op = next().text === '+' ? '+' : '-'
      const right = term()
      left = at({ kind: 'bin', op, left, right }, range(left)[0], range(right)[1])
    }
    depth--
    return left
  }

  function term(): Expr {
    let left = unary()
    while (isOp(peek(), '*', '/', 'mod')) {
      const op = next().text as '*' | '/' | 'mod'
      const right = unary()
      const [start] = range(left)
      const [, end] = range(right)
      left = at(op === 'mod' ? reduction(left, right) : { kind: 'bin', op, left, right }, start, end)
    }
    return left
  }

  function unary(): Expr {
    const t = peek()
    if (isOp(t, '-', '−')) {
      next()
      const n = peek()
      // "-5" (ASCII minus directly before a number) is the literal −5, as numbers are printed;
      // "−x" (U+2212, as negation is printed) and "-x" are negation.
      if (t.text === '-' && n.kind === 'num' && n.start === t.end) {
        next()
        return implicitProduct(at({ kind: 'num', value: -n.value! }, t.start, n.end))
      }
      if (++depth > MAX_DEPTH) throw new FormulaSyntaxError('formula is nested too deeply', t.start, t.end)
      const arg = unary()
      depth--
      return at({ kind: 'neg', arg }, t.start, range(arg)[1])
    }
    return primary()
  }

  function primary(): Expr {
    const t = next()
    switch (t.kind) {
      case 'num':
        return implicitProduct(at({ kind: 'num', value: t.value! }, t.start, t.end))
      case '(': {
        const inner = expr()
        const close = next()
        if (close.kind !== ')') throw new FormulaSyntaxError('missing ")"', t.start, close.end)
        where.set(inner, [t.start, close.end])
        return inner
      }
      case 'name':
        return name(t)
      case ')':
        throw new FormulaSyntaxError('unexpected ")"', t.start, t.end)
      case 'end':
        throw new FormulaSyntaxError('formula ends too early', t.start, t.end)
      case 'op':
        throw new FormulaSyntaxError(`"${src.slice(t.start, t.end)}" needs a value before it`, t.start, t.end)
    }
  }

  /** "2π", "3n": a number immediately followed by a name (no space) multiplies it. */
  function implicitProduct(numberNode: Expr): Expr {
    const n = peek()
    const [start, end] = range(numberNode)
    if (n.kind === 'name' && n.start === end && !(FUNCTIONS as readonly string[]).includes(n.text)) {
      next()
      const right = name(n)
      return at({ kind: 'bin', op: '*', left: numberNode, right }, start, range(right)[1])
    }
    return numberNode
  }

  function name(t: Token): Expr {
    if (t.text === 'π' || t.text === 'pi') return at({ kind: 'pi' }, t.start, t.end)
    if ((FUNCTIONS as readonly string[]).includes(t.text)) {
      const open = next()
      if (open.kind !== '(')
        throw new FormulaSyntaxError(`${t.text} needs parentheses: ${t.text}(…)`, t.start, open.end)
      const arg = expr()
      const close = next()
      if (close.kind !== ')') throw new FormulaSyntaxError('missing ")"', open.start, close.end)
      return at({ kind: 'call', fn: t.text as FnName, arg }, t.start, close.end)
    }
    if (t.text === 'C') {
      if (!options.allowConstant)
        throw new FormulaSyntaxError('C (the constant) is not available here', t.start, t.end)
      return at({ kind: 'var', name: CONSTANT_MARK }, t.start, t.end)
    }
    if (!variables.has(t.text)) {
      const known = [...options.variables, ...(options.allowConstant ? ['C'] : []), 'π']
      throw new FormulaSyntaxError(
        `unknown name "${t.text}" (available: ${known.join(', ')})`,
        t.start,
        t.end,
      )
    }
    return at({ kind: 'var', name: t.text }, t.start, t.end)
  }

  /** `left mod right`: an exact reduction when right is 2π, or when C is a factor; else float mod. */
  function reduction(left: Expr, right: Expr): Expr {
    const factors = flattenProduct(left)
    const constants = factors.filter(isConstantMark)
    const rest = factors.filter((f) => !isConstantMark(f))
    if (isTwoPi(right) && (constants.length > 0 || factors.length > 1)) {
      if (constants.length > 2)
        throw new FormulaSyntaxError(
          'C may appear at most twice (C²) in a reduction mod 2π',
          ...range(constants[2]!),
        )
      for (const f of rest) {
        if (f.kind === 'pi')
          throw new FormulaSyntaxError(
            'π as a factor would be rounded to float64 first; select π as the constant and write C for an exact reduction',
            ...range(f),
          )
      }
      if (constants.length === 2) return { kind: 'modTau', factors: rest, withConstant: true, squared: true }
      return { kind: 'modTau', factors: rest, withConstant: constants.length === 1 }
    }
    if (constants.length === 0) return { kind: 'bin', op: 'mod', left, right }
    if (constants.length > 1)
      throw new FormulaSyntaxError('C may appear only once in a reduction', ...range(constants[1]!))
    if (right.kind !== 'num' || !Number.isSafeInteger(right.value) || right.value <= 0)
      throw new FormulaSyntaxError(
        'an exact reduction with C needs a positive whole number or 2π after "mod"',
        ...range(right),
      )
    return { kind: 'constMod', factors: rest, modulus: right.value }
  }

  const result = expr()
  const rest = peek()
  if (rest.kind !== 'end') {
    const hint =
      rest.kind === 'name' || rest.kind === 'num' || rest.kind === '(' ? ' (missing an operator?)' : ''
    throw new FormulaSyntaxError(
      `unexpected "${src.slice(rest.start, rest.end)}"${hint}`,
      rest.start,
      rest.end,
    )
  }
  const stray = findConstantMark(result)
  if (stray)
    throw new FormulaSyntaxError(
      'C can only be used exactly: as a factor of "(… × C) mod 2π" or "(… × C) mod 360" (n × C in float64 would lose the digits)',
      ...range(stray),
    )
  return result
}

/** Top-level factors of a product, e.g. (a × b) × c → [a, b, c]; anything else is one factor. */
function flattenProduct(e: Expr): Expr[] {
  return e.kind === 'bin' && e.op === '*' ? [...flattenProduct(e.left), ...flattenProduct(e.right)] : [e]
}

function isConstantMark(e: Expr): boolean {
  return e.kind === 'var' && e.name === CONSTANT_MARK
}

function isTwoPi(e: Expr): boolean {
  return (
    e.kind === 'bin' && e.op === '*' && e.left.kind === 'num' && e.left.value === 2 && e.right.kind === 'pi'
  )
}

function findConstantMark(e: Expr): Expr | null {
  switch (e.kind) {
    case 'var':
      return isConstantMark(e) ? e : null
    case 'bin':
      return findConstantMark(e.left) ?? findConstantMark(e.right)
    case 'neg':
    case 'call':
      return findConstantMark(e.arg)
    case 'constMod':
    case 'modTau':
      for (const f of e.factors) {
        const found = findConstantMark(f)
        if (found) return found
      }
      return null
    default:
      return null
  }
}
