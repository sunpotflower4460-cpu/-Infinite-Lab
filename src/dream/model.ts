import priorData from './data/atlas-prior.json'
import executionData from './data/executions.json'

export const DREAM_COMMIT = '8874604831ae596ecba4c9cc7dc5a25228e5db65'
export const DREAM_URL = `https://github.com/sunpotflower4460-cpu/Dream-box/blob/${DREAM_COMMIT}`
export type View = 'meaning' | 'implementation'
export type Applicability = 'MATCH' | 'PENDING' | 'EXCLUDED'
export interface Concept {
  id: string
  words: string[]
  context?: string
  aliases?: { word: string; language: string }[]
}
export interface Relation {
  source: string
  target: string
  type: string
  context?: string
  negated?: boolean
  qualifiers?: { scope?: string; conditions?: Record<string, string | boolean | number> }
  provenance: string[]
}
export const prior = priorData as { concepts: Concept[]; relations: Relation[] }
export const relationNames: Record<string, string> = {
  is_a: '種類',
  part_of: '一部',
  used_as: '用途',
  made_of: '素材',
  affords: 'できること',
  transforms_to: '変化',
  resembles: '似ている',
}
export type FactState = 'unknown' | 'yes' | 'no'
export interface MeaningQuery {
  word: string
  context: string
  focus: string
  facts: FactState
}
export const DEFAULT_QUERY: MeaningQuery = {
  word: 'じゃがいも',
  context: '料理',
  focus: 'used_as',
  facts: 'yes',
}
export const labelOf = (id: string): string => prior.concepts.find((c) => c.id === id)?.words[0] || id
const normalizeWord = (word: string) => word.normalize('NFKC').trim()

/** A bounded view of the frozen Atlas prior. Same alias/context/condition rules;
 * not the full Atlas learner and never an invented semantic similarity score.
 * The shipped prior has scalar conjunctions only (checked in unit tests).
 */
export function applicability(r: Relation, query: MeaningQuery): Applicability {
  let pending = !!r.context && !query.context
  if (r.context && query.context && r.context !== query.context) return 'EXCLUDED'
  const facts: Record<string, string | boolean> =
    query.facts === 'unknown'
      ? {}
      : {
          suitableForCooking: query.facts === 'yes',
          mineralBearing: query.facts === 'yes',
          material: query.facts === 'yes' ? 'wood' : 'metal',
          process: query.facts === 'yes' ? 'soymilk-coagulation' : 'none',
        }
  for (const [key, expected] of Object.entries(r.qualifiers?.conditions || {})) {
    if (!Object.hasOwn(facts, key)) pending = true
    else if (facts[key] !== expected) return 'EXCLUDED'
  }
  return pending ? 'PENDING' : 'MATCH'
}
export interface GraphNode {
  id: string
  label: string
  parent: string
  type: string
  status: Applicability
  depth: number
  negated: boolean
  source: string[]
}
export interface MeaningGraph {
  query: MeaningQuery
  concepts: Concept[]
  nodes: GraphNode[]
  selected: string | null
  status: 'selected' | 'unknown' | 'ambiguous' | 'pending' | 'unavailable'
  detail: string
}
export function meaningGraph(query: MeaningQuery): MeaningGraph {
  const concepts = prior.concepts.filter(
    (c) =>
      (!query.context || !c.context || query.context === c.context) &&
      (c.aliases || c.words.map((word) => ({ word }))).some(
        (a) => normalizeWord(a.word) === normalizeWord(query.word),
      ),
  )
  const nodes: GraphNode[] = []
  const base = { query, concepts, nodes, selected: null }
  if (!concepts.length)
    return { ...base, status: 'unknown', detail: '未登録の言葉です。意味を作らず、説明を待ちます。' }
  if (concepts.length > 1) {
    for (const c of concepts)
      nodes.push({
        id: c.id,
        label: labelOf(c.id),
        parent: 'word',
        type: c.context || '語義',
        depth: 1,
        status: 'PENDING',
        negated: false,
        source: [],
      })
    return { ...base, status: 'ambiguous', detail: '複数の語義があります。文脈を指定するまで選びません。' }
  }
  const root = concepts[0]!.id
  const seen = new Set([root])
  const add = (parent: string, depth: number) => {
    for (const r of prior.relations.filter((r) => r.source === parent)) {
      const status = applicability(r, query)
      if (status === 'EXCLUDED' || seen.has(r.target)) continue
      seen.add(r.target)
      nodes.push({
        id: r.target,
        label: labelOf(r.target),
        parent,
        type: r.type,
        status,
        depth,
        negated: !!r.negated,
        source: r.provenance,
      })
    }
  }
  add(root, 1)
  for (const n of [...nodes]) if (!n.negated && n.status === 'MATCH') add(n.id, 2)
  // This explainer's selection rule is explicit: a unique, positive, applicable
  // direct relation of the requested kind. Atlas itself does not pick one winner.
  const matches = nodes.filter(
    (n) => n.depth === 1 && n.type === query.focus && n.status === 'MATCH' && !n.negated,
  )
  const blockers = nodes.filter((n) => n.depth === 1 && n.type === query.focus && n.negated)
  if (matches.length === 1 && !blockers.length)
    return {
      ...base,
      selected: matches[0]!.id,
      status: 'selected',
      detail: `${query.word} → ${relationNames[query.focus] || query.focus} → ${matches[0]!.label}`,
    }
  if (matches.length > 1 || blockers.some((n) => n.status === 'MATCH'))
    return {
      ...base,
      status: 'ambiguous',
      detail: blockers.length
        ? 'この関係には否定の記録があります。肯定の意味として選びません。'
        : '候補が複数あります。自動では選びません。',
    }
  if (nodes.some((n) => n.depth === 1 && n.type === query.focus && n.status === 'PENDING'))
    return { ...base, status: 'pending', detail: '必要な文脈・条件が不明です。条件が分かるまで選びません。' }
  return { ...base, status: 'unavailable', detail: 'この観点で成立する登録関係がありません。' }
}

export interface Part {
  id: string
  shape: string
  size: number[]
  at: number[]
  material: { color?: string; opacity?: number }
}
export interface Entity {
  id: string
  name: string
  kind: string
  pos: { x: number; y: number; z: number }
  parts: Part[]
}
export interface Candidate {
  id: string
  label: string
  frame: string | null
  bindings: string[]
  plan: {
    status: string
    physicalOps: {
      type: string
      count?: number
      kind?: string
      color?: string
      target?: { ids?: string[] }
    }[]
    held: { word: string }[]
    unknown: string[]
  }
  graph: { nodes: { id: string; kind: string }[]; unresolved: { text: string }[] }
}
export interface Decision {
  choice: string | null
  understanding: {
    source: {
      rawText: string
      normalizedText: string
      compilationText: string
      worldId: string
      worldRevision: string
    }
    candidates: Candidate[]
    selectedCandidateId: string | null
    interpretation: string
    realization: string
    issue: string | null
    searchStatus: string
    references: { surface: string; status: string; candidates: { id: string; reason: string }[] }[]
  }
  preview: { entities: Entity[] }
  outcome: { applied: { entities: string[] } | null; planStatus: string; followups: { text: string }[] }
  after: Entity[]
  held: { word: string }[]
}
export interface Scenario {
  id: string
  title: string
  text: string
  setup: string[]
  tokens: { surface: string; pos: string }[]
  before: Entity[]
  decisions: Decision[]
}
export const executions = executionData as unknown as {
  commit: string
  cases: Scenario[]
  checks: Record<string, boolean>
}
export const scenarioById = (id: string): Scenario =>
  executions.cases.find((c) => c.id === id) || executions.cases[0]!
export const decisionFor = (s: Scenario, choice: string | null): Decision =>
  s.decisions.find((d) => d.choice === choice) || s.decisions[0]!
export const selectedCandidate = (d: Decision): Candidate | undefined =>
  d.understanding.candidates.find((c) => c.id === d.understanding.selectedCandidateId)

export const DURATION = 16
export const phaseIndex = (progress: number): number => Math.min(4, Math.floor(Math.max(0, progress) * 5))
export const PHASES: Record<View, string[]> = {
  meaning: ['言葉を受け取る', '概念につながる', '関係が広がる', '観点で絞る', 'ひとつを選ぶ'],
  implementation: ['原文を保つ', '文法・参照を調べる', '解釈候補を作る', '実行を確認する', '世界へ反映する'],
}
