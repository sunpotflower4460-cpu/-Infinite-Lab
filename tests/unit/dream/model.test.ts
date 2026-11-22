import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUERY,
  DREAM_COMMIT,
  decisionFor,
  executions,
  meaningGraph,
  prior,
  scenarioById,
  selectedCandidate,
} from '../../../src/dream/model'

describe('meaning room: explicit source relations, no invented meanings', () => {
  it('preserves classification vs role, and only selects a unique positive applicable direct relation', () => {
    const food = meaningGraph(DEFAULT_QUERY)
    expect(food.selected).toBe('ingredient')
    expect(food.nodes.find((n) => n.id === 'tuber')?.type).toBe('is_a')
    expect(food.nodes.find((n) => n.id === 'ingredient')?.type).toBe('used_as')
    expect(meaningGraph({ ...DEFAULT_QUERY, focus: 'is_a' }).selected).toBe('tuber')
    for (const node of food.nodes)
      expect(
        prior.relations.some((r) => r.source === node.parent && r.target === node.id && r.type === node.type),
      ).toBe(true)
  })
  it('does not silently replace unknown conditions with true, or a negative edge with a positive one', () => {
    expect(meaningGraph({ ...DEFAULT_QUERY, facts: 'unknown' })).toMatchObject({
      selected: null,
      status: 'pending',
    })
    expect(meaningGraph({ ...DEFAULT_QUERY, facts: 'no' })).toMatchObject({
      selected: null,
      status: 'unavailable',
    })
    const model = meaningGraph({ ...DEFAULT_QUERY, word: 'じゃがいも模型' })
    expect(model.selected).toBeNull()
    expect(model.nodes.find((n) => n.id === 'ingredient')?.negated).toBe(true)
    expect(meaningGraph({ ...DEFAULT_QUERY, context: '建設' }).selected).toBeNull()
  })
  it('leaves unknown names and ambiguous aliases unresolved; context disambiguates a known alias', () => {
    expect(meaningGraph({ ...DEFAULT_QUERY, word: '未登録の宇宙野菜' })).toMatchObject({
      selected: null,
      nodes: [],
      status: 'unknown',
    })
    const ambiguous = meaningGraph({ ...DEFAULT_QUERY, word: 'はし', context: '' })
    expect(ambiguous.status).toBe('ambiguous')
    expect(ambiguous.nodes.map((n) => n.id)).toEqual(['bridge', 'chopsticks'])
    const known = meaningGraph({ ...DEFAULT_QUERY, word: 'はし', context: '食卓', focus: 'is_a' })
    expect(known.concepts.map((c) => c.id)).toEqual(['chopsticks'])
    expect(known.selected).toBe('tool')
    expect(meaningGraph({ ...DEFAULT_QUERY, word: '　ジャガイモ　' }).selected).toBe('ingredient')
  })
  it('keeps the bounded prior within the supported scalar condition subset', () => {
    expect(prior.concepts).toHaveLength(21)
    expect(prior.relations).toHaveLength(23)
    for (const r of prior.relations) {
      expect(Object.keys(r.qualifiers || {}).every((k) => ['scope', 'conditions'].includes(k))).toBe(true)
      expect(prior.concepts.some((c) => c.id === r.source)).toBe(true)
      expect(prior.concepts.some((c) => c.id === r.target)).toBe(true)
    }
  })
})

describe('Dream-box recordings: what was actually executed', () => {
  it('identifies the exact reference revision and verifies the source capture safeguards', () => {
    expect(executions.commit).toBe(DREAM_COMMIT)
    expect(executions.checks).toEqual({
      understandReadOnly: true,
      previewReadOnly: true,
      blockedEntitiesUnchanged: true,
    })
  })
  it('does not change entities when multiple candidates exist; each explicit choice changes only its bindings', () => {
    const s = scenarioById('ambiguous'),
      waiting = decisionFor(s, null)
    expect(waiting.understanding.candidates).toHaveLength(4)
    expect(waiting.understanding.selectedCandidateId).toBeNull()
    expect(waiting.preview.entities).toEqual([])
    expect(waiting.outcome.applied).toBeNull()
    expect(waiting.after).toEqual(s.before)
    for (const candidate of waiting.understanding.candidates) {
      const selected = decisionFor(s, candidate.id)
      expect(selected.understanding.realization).toBe('ready')
      const changed = selected.after.filter((e) => e.parts[0]?.material.color === '#ff2038').map((e) => e.id)
      expect(changed).toEqual(candidate.bindings)
      expect(selected.preview.entities.map((e) => e.id)).toEqual(candidate.bindings)
    }
  })
  it('retains three distinct entity IDs for the pronoun, rather than inventing a single reference', () => {
    const s = scenarioById('reference'),
      d = decisionFor(s, null)
    expect(d.understanding.references[0]?.surface).toBe('それ')
    expect(d.understanding.references[0]?.candidates.map((c) => c.id)).toEqual(['box7', 'box8', 'box9'])
    const selected = decisionFor(s, 'candidate:1')
    expect(selectedCandidate(selected)?.bindings).toEqual(['box8'])
    expect(selected.after.filter((e) => e.parts[0]?.material.color === '#2080ff').map((e) => e.id)).toEqual([
      'box8',
    ])
  })
  it('preserves an explicit count, and holds an unknown word until an explicit definition arrives', () => {
    const created = decisionFor(scenarioById('create'), null)
    expect(created.outcome.applied?.entities).toEqual(['box7', 'box8', 'box9'])
    const unknown = scenarioById('unknown'),
      held = decisionFor(unknown, null)
    expect(held.outcome.applied).toBeNull()
    expect(held.after).toEqual(unknown.before)
    expect(held.held.map((h) => h.word)).toContain('星のたね')
    const taught = decisionFor(scenarioById('taught'), null)
    expect(taught.understanding.realization).toBe('ready')
    const balls = taught.after.filter((e) => e.parts[0]?.shape === 'ball')
    expect(balls).toHaveLength(1)
    expect(balls[0]?.parts[0]?.size).toEqual([0.5, 0.5, 0.5])
    expect(taught.held).toEqual([])
  })
})
