import { describe, expect, it } from 'vitest'
import { parseConfig } from '../../../src/lab/config'
import { PRESETS } from '../../../src/lab/presets'
import {
  addHistory,
  HISTORY_KEY,
  HISTORY_LIMIT,
  loadHistory,
  removeHistory,
  type KeyValueStorage,
} from '../../../src/lab/history'
import { FILE_FORMAT, parseImport } from '../../../src/lab/experimentFile'
import { EXPERIMENTS } from '../../../src/experiments/registry'

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe('parseConfig', () => {
  it('fills defaults', () => {
    const c = parseConfig({ experiment: 'circle-chain' })
    expect(c).toEqual({
      constant: 'pi',
      precision: 1000,
      experiment: 'circle-chain',
      digitStart: 'integer',
      parameters: { radiusScale: 2, cumulative: true, drawLinks: false },
    })
  })

  it('accepts the spec §24 preset shape', () => {
    const c = parseConfig({ constant: 'pi', experiment: 'circle-chain', parameters: { radiusScale: 2 } })
    expect(c.parameters.radiusScale).toBe(2)
  })

  it.each([
    [{ experiment: 'nope' }, /unknown experiment/],
    [{ experiment: 'circle-chain', constant: 'tau' }, /unknown constant/],
    [{ experiment: 'circle-chain', precision: 0 }, /precision/],
    [{ experiment: 'circle-chain', digitStart: 'middle' }, /digitStart/],
    [{ experiment: 'circle-chain', parameters: { radiusScale: 'big' } }, /radiusScale/],
    [{ experiment: 'circle-chain', parameters: { radiusScale: 1e9 } }, /radiusScale/],
    [{ experiment: 'circle-chain', parameters: { cumulative: 1 } }, /cumulative/],
    [{ experiment: 'circle-chain', parameters: { evil: 1 } }, /unknown parameter/],
    [null, /object/],
  ])('rejects invalid input %j', (input, message) => {
    expect(() => parseConfig(input)).toThrow(message)
  })
})

describe('presets', () => {
  it('are valid and reference existing experiments', () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      'Pi Walk',
      'Pi Circle Chain',
      'Pi Flower',
      'Pi Orbit',
      'Pi Spiral',
      'Pi Two-Arm (reference candidate)',
      'π Film (reference video look)',
      'Playground: spec example',
      'Playground: turning walk',
      'Playground: C-radian rotation',
    ])
    for (const p of PRESETS) expect(EXPERIMENTS[p.config.experiment]).toBeDefined()
  })
})

describe('history', () => {
  const entry = (id: string, steps = 10) => ({
    id,
    timestamp: '2026-09-25T00:00:00.000Z',
    config: parseConfig({ experiment: 'digit-circle-walk' }),
    steps,
  })

  it('adds newest first, removes, and caps the list', () => {
    const s = memoryStorage()
    addHistory(s, entry('a'))
    addHistory(s, entry('b'))
    expect(loadHistory(s).map((e) => e.id)).toEqual(['b', 'a'])
    expect(removeHistory(s, 'b').map((e) => e.id)).toEqual(['a'])
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) addHistory(s, entry(`x${i}`))
    expect(loadHistory(s)).toHaveLength(HISTORY_LIMIT)
  })

  it('drops corrupted or foreign entries instead of trusting them', () => {
    const s = memoryStorage()
    s.setItem(
      HISTORY_KEY,
      JSON.stringify([
        entry('ok'),
        { id: 'bad', timestamp: 'x', steps: -1 },
        { id: 'evil', timestamp: 'x', steps: 1, config: { experiment: '__proto__' } },
      ]),
    )
    expect(loadHistory(s).map((e) => e.id)).toEqual(['ok'])
    s.setItem(HISTORY_KEY, '{not json')
    expect(loadHistory(s)).toEqual([])
  })

  it('works without storage', () => {
    expect(loadHistory(undefined)).toEqual([])
    expect(addHistory(undefined, entry('a'))).toHaveLength(1)
  })
})

describe('experiment file import', () => {
  const file = {
    format: FILE_FORMAT,
    version: 1,
    config: {
      constant: 'e',
      precision: 1000,
      experiment: 'pi-rotation',
      digitStart: 'integer',
      parameters: { modifier: 2 },
    },
    steps: 500,
    result: { geometrySha256: 'a'.repeat(64) },
  }

  it('parses a full file with steps and digest', () => {
    const p = parseImport(JSON.stringify(file))
    expect(p.steps).toBe(500)
    expect(p.expectedDigest).toBe('a'.repeat(64))
    expect(p.config.constant).toBe('e')
  })

  it('parses a bare preset', () => {
    const p = parseImport(
      JSON.stringify({ constant: 'pi', experiment: 'circle-chain', parameters: { radiusScale: 2 } }),
    )
    expect(p.steps).toBeUndefined()
  })

  it('rejects malformed files', () => {
    expect(() => parseImport('nope')).toThrow(/JSON/)
    expect(() => parseImport(JSON.stringify({ ...file, version: 99 }))).toThrow(/version/)
    expect(() => parseImport(JSON.stringify({ ...file, steps: -5 }))).toThrow(/steps/)
    expect(() => parseImport(JSON.stringify({ ...file, result: { geometrySha256: 'xyz' } }))).toThrow(
      /Sha256/,
    )
  })
})

describe('parseConfig rejects inherited / non-string ids', () => {
  it.each([
    [{ constant: 'toString', experiment: 'circle-chain' }, /unknown constant/],
    [{ constant: '__proto__', experiment: 'circle-chain' }, /unknown constant/],
    [{ constant: 5, experiment: 'circle-chain' }, /unknown constant/],
    [{ experiment: 'constructor' }, /unknown experiment/],
    [{ experiment: 'hasOwnProperty' }, /unknown experiment/],
    [{ experiment: 'circle-chain', parameters: [1] }, /parameters must be an object/],
  ])('%j', (input, message) => {
    expect(() => parseConfig(input)).toThrow(message)
  })
})

describe('file format versions', () => {
  const base = {
    format: FILE_FORMAT,
    steps: 10,
    result: { geometrySha256: 'b'.repeat(64) },
  }
  it('reads v1 (v0.2) files and explains possible Pi Rotation differences below 120 digits', () => {
    const v1 = parseImport(
      JSON.stringify({ ...base, version: 1, config: { experiment: 'pi-rotation', precision: 100 } }),
    )
    expect(v1.compatibilityNote).toMatch(/120/)
    const v1ok = parseImport(
      JSON.stringify({ ...base, version: 1, config: { experiment: 'pi-rotation', precision: 1000 } }),
    )
    expect(v1ok.compatibilityNote).toBeUndefined()
    const v2 = parseImport(
      JSON.stringify({ ...base, version: 2, config: { experiment: 'pi-rotation', precision: 100 } }),
    )
    expect(v2.compatibilityNote).toBeUndefined()
    expect(() =>
      parseImport(JSON.stringify({ ...base, version: 4, config: { experiment: 'pi-rotation' } })),
    ).toThrow(/version/)
  })

  it('v3 carries the Formula Playground formulas, validated by parsing them', () => {
    const formulas = { angle: '(angle_prev + digit × π / 5) mod 2π', radius: 'digit / 2', distance: '3' }
    const v3 = parseImport(
      JSON.stringify({ ...base, version: 3, config: { experiment: 'playground', formulas } }),
    )
    expect(v3.config.formulas).toEqual(formulas)
    // missing formulas take the spec's example; other experiments have none
    expect(parseConfig({ experiment: 'playground' }).formulas).toEqual({
      angle: 'digit × π / 5',
      radius: 'digit × 2',
      distance: '5',
    })
    expect(parseConfig({ experiment: 'pi-rotation' }).formulas).toBeUndefined()
    expect(() => parseConfig({ experiment: 'pi-rotation', formulas })).toThrow(
      /only used by the Formula Playground/,
    )
    expect(() => parseConfig({ experiment: 'playground', formulas: { angle: 'digit ×' } })).toThrow(
      /formula ANGLE: formula ends too early/,
    )
    expect(() => parseConfig({ experiment: 'playground', formulas: { angle: 'n × C' } })).toThrow(
      /C can only/,
    )
    expect(() => parseConfig({ experiment: 'playground', formulas: { colour: 'red' } })).toThrow(
      /unknown formula/,
    )
    expect(() => parseConfig({ experiment: 'playground', formulas: { angle: 5 } })).toThrow(
      /must be a string/,
    )
  })
})

describe('film speed', () => {
  it('grows like the reference video and is capped', async () => {
    const { filmSpeed } = await import('../../../src/app/filmSpeed')
    expect(filmSpeed(0)).toBe(5)
    expect(filmSpeed(9)).toBeCloseTo(5 * Math.E, 12)
    expect(filmSpeed(1000)).toBe(5000)
    // drawing time T = dt · ∫ speed: ≈ 27 at 22 s and ≈ 130 at 36 s in the video
    const T = (t: number) => 0.05 * 5 * 9 * (Math.exp(t / 9) - 1)
    expect(T(22)).toBeGreaterThan(20)
    expect(T(22)).toBeLessThan(35)
    expect(T(36)).toBeGreaterThan(100)
    expect(T(36)).toBeLessThan(160)
  })
})
