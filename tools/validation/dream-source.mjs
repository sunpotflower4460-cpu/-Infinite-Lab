/** Capture real, bounded Dream-box executions; never substitute a mock interpreter.
 * Usage: node tools/validation/dream-source.mjs /path/to/Dream-box [--check]
 * The reference checkout needs its bundled Rapier and Three dependencies available.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const sha = '8874604831ae596ecba4c9cc7dc5a25228e5db65'
const root = resolve(process.argv[2] || '/workspace/dream-box')
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sha)
execFileSync(
  'git',
  [
    'diff',
    '--exit-code',
    sha,
    '--',
    'experiments/text-to-living-world/src',
    'experiments/concept-research/atlas/prior.json',
  ],
  { cwd: root },
)
const base = join(root, 'experiments/text-to-living-world/src')
const moduleAt = (p) => import(pathToFileURL(join(base, p)).href)
const { createWorld, serializeWorld, deserializeWorld } = await moduleAt('engine/world.js')
const { understand, commitUnderstanding, previewUnderstanding } = await moduleAt('meaning/index.js')
const { disposePhysics } = await moduleAt('engine/physics/adapter.js')
const { tokenize } = await moduleAt('engine/tokenizer.js')
const { parse } = await moduleAt('engine/parser.js')
const compactEntity = (e) => ({
  id: e.id,
  kind: e.kind,
  name: e.name,
  pos: e.pos,
  mat: e.mat,
  parts: (e.physical?.graph?.parts || []).map(({ id, shape, size, at, material }) => ({
    id,
    shape,
    size,
    at,
    material,
  })),
})
const compactUnderstanding = (u) => ({
  source: {
    rawText: u.source.rawText,
    compilationText: u.source.compilationText,
    normalizedText: u.source.normalizedText,
    worldId: u.source.worldId,
    worldRevision: u.source.worldRevision,
  },
  selectedCandidateId: u.selectedCandidateId,
  interpretation: u.interpretation,
  grounding: u.grounding,
  realization: u.realization,
  issue: u.issue,
  searchStatus: u.searchStatus,
  references: (u.references || []).map((r) => ({
    surface: r.surface,
    status: r.status,
    sourceSpan: r.sourceSpan,
    candidates: r.candidates.map((c) => ({ id: c.id, reason: c.reason, alive: c.alive })),
    selectedIds: r.selectedIds || [],
  })),
  candidates: u.candidates.map((c) => ({
    id: c.id,
    label: c.label,
    frame: c.frame,
    bindings: c.bindings,
    plan: {
      status: c.plan.status,
      physicalOps: c.plan.physicalOps || [],
      held: c.plan.held || [],
      requirements: c.plan.requirements || [],
      assumptions: c.plan.assumptions || [],
      unknown: c.plan.unknown || [],
    },
    graph: {
      nodes: c.graph.nodes.map((n) => ({ id: n.id, kind: n.kind, sourceSpan: n.sourceSpan })),
      unresolved: c.graph.unresolved,
      coverage: c.graph.coverage,
    },
  })),
})
const state = (w, s) => JSON.stringify({ world: serializeWorld(w), session: s })
const cases = []

for (const spec of [
  { id: 'create', title: '数を保って作る', text: '箱を三つ作る', setup: [] },
  { id: 'ambiguous', title: '対象を選んでから実行', text: '箱を赤くする', setup: ['箱を三つ作る'] },
  { id: 'reference', title: '「それ」を前の対象へ結ぶ', text: 'それを青くする', setup: ['箱を三つ作る'] },
  { id: 'unknown', title: '知らない言葉は説明を待つ', text: '「星のたね」を一つ作る', setup: [] },
  {
    id: 'taught',
    title: '説明を受けて保留を再開',
    text: '「星のたね」とは、小さな木の球とする',
    setup: ['「星のたね」を一つ作る'],
  },
]) {
  const world = createWorld({ seed: 1, physical: true, worldId: `meaning-room:${spec.id}` })
  const session = { lastActor: null, lastTarget: null }
  for (const [i, text] of spec.setup.entries()) {
    const u = understand(text, world, session, { utteranceId: `${spec.id}:setup:${i}` })
    commitUnderstanding(world, u, session)
  }
  const before = state(world, session)
  const options = { utteranceId: `${spec.id}:input` }
  const initial = understand(spec.text, world, session, options)
  assert.equal(state(world, session), before, 'understand must be read-only')
  const snapshot = serializeWorld(world),
    savedSession = structuredClone(session)
  const choices = [null, ...(initial.candidates.length > 1 ? initial.candidates.map((c) => c.id) : [])]
  const decisions = []
  for (const choice of choices) {
    const w = deserializeWorld(snapshot),
      s = structuredClone(savedSession)
    const u = understand(spec.text, w, s, { ...options, ...(choice ? { candidateId: choice } : {}) })
    const beforePreview = state(w, s),
      preview = previewUnderstanding(w, u)
    assert.equal(state(w, s), beforePreview, 'preview must be read-only')
    const outcome = commitUnderstanding(w, u, s)
    const after = w.entities.map(compactEntity)
    if (u.interpretation === 'ambiguous' || spec.id === 'unknown') {
      assert.equal(outcome.applied, null)
      assert.deepEqual(after, world.entities.map(compactEntity), 'blocked input must not change entities')
    }
    if (spec.id === 'create') assert.equal(outcome.applied.entities.length, 3)
    if (spec.id === 'taught') assert.equal(after.filter((e) => e.kind === 'ball').length, 1)
    decisions.push({
      choice,
      understanding: compactUnderstanding(u),
      preview: { ...preview, entities: preview.entities.map(compactEntity) },
      outcome: {
        applied: outcome.applied,
        stale: !!outcome.stale,
        queued: !!outcome.queued,
        planStatus: outcome.plan.status,
        followups: (outcome.followups || []).map((f) => ({
          applied: f.applied,
          text: f.understanding.source.rawText,
        })),
      },
      after,
      episodes: (s.episodes || []).map((e) => ({
        id: e.id,
        originalText: e.originalText,
        entityIds: e.outcome.entityIds,
        applied: e.outcome.applied,
      })),
      held: s.held || [],
    })
    disposePhysics(w)
  }
  cases.push({
    ...spec,
    before: world.entities.map(compactEntity),
    tokens: tokenize(initial.source.compilationText).map((t) => ({ surface: t.surface, pos: t.pos })),
    // This generic parser is one component, not the only physical-language path.
    parsed: parse(initial.source.compilationText).sentences.map((s) =>
      s.clauses.map((c) => ({ verb: c.verb?.lemma || null, neg: c.neg, conn: c.conn })),
    ),
    decisions,
  })
  disposePhysics(world)
}
const tracked = [
  'meaning/index.js',
  'meaning/source.js',
  'meaning/graph.js',
  'meaning/references.js',
  'engine/grounding.js',
  'engine/tokenizer.js',
  'engine/parser.js',
  'engine/physics/adapter.js',
  'engine/physics/program.js',
  'engine/sim/spawn.js',
  'main.js',
]
const hashes = {}
for (const p of tracked)
  hashes[p] = createHash('sha256')
    .update(await readFile(join(base, p)))
    .digest('hex')
const result = {
  schema: 1,
  repository: 'sunpotflower4460-cpu/Dream-box',
  commit: sha,
  kind: 'recorded-execution',
  physical: true,
  seed: 1,
  checks: { understandReadOnly: true, previewReadOnly: true, blockedEntitiesUnchanged: true },
  hashes,
  cases,
}
const dest = fileURLToPath(new URL('../../src/dream/data/', import.meta.url))
await mkdir(dest, { recursive: true })
const outputs = {
  'executions.json': JSON.stringify(result, null, 2) + '\n',
  'atlas-prior.json': await readFile(join(root, 'experiments/concept-research/atlas/prior.json'), 'utf8'),
}
for (const [name, text] of Object.entries(outputs)) {
  if (process.argv.includes('--check'))
    assert.deepEqual(JSON.parse(await readFile(join(dest, name), 'utf8')), JSON.parse(text), name)
  else await writeFile(join(dest, name), text)
}
console.log(
  JSON.stringify({
    commit: sha,
    cases: cases.map((c) => ({ id: c.id, decisions: c.decisions.length })),
    checks: result.checks,
  }),
)
