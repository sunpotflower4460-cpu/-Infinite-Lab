/** Compare the bounded explainer against the real Atlas API at the frozen SHA. */
import { createServer } from 'vite'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const root = resolve(process.argv[2] || '/workspace/dream-box')
const base = join(root, 'experiments/concept-research/atlas')
const original = await import(pathToFileURL(join(base, 'graph-api.mjs')).href)
const originalPrior = JSON.parse(await readFile(join(base, 'prior.json'), 'utf8'))
const server = await createServer({ server: { middlewareMode: true } })
try {
  const { meaningGraph, prior, DREAM_COMMIT } = await server.ssrLoadModule('/src/dream/model.ts')
  assert.deepEqual(prior, originalPrior)
  let aliases = 0,
    relations = 0
  const factsFor = (state) =>
    state === 'unknown'
      ? {}
      : {
          suitableForCooking: state === 'yes',
          mineralBearing: state === 'yes',
          material: state === 'yes' ? 'wood' : 'metal',
          process: state === 'yes' ? 'soymilk-coagulation' : 'none',
        }
  for (const word of [
    ...new Set(originalPrior.concepts.flatMap((c) => c.aliases.map((a) => a.word))),
    '未登録の語',
  ]) {
    for (const context of ['', '料理', '実験台', '食卓', '交通', '加工', '建設', '教材']) {
      for (const facts of ['unknown', 'yes', 'no']) {
        const q = { word, context, facts, focus: 'used_as' },
          g = meaningGraph(q)
        const lookup = original.lookupWord(originalPrior, word, { context })
        assert.deepEqual(
          g.concepts.map((c) => c.id),
          lookup.concepts.map((c) => c.id),
        )
        aliases++
        if (g.concepts.length !== 1) continue
        const expected = original.getRelations(originalPrior, g.concepts[0].id, {
          context,
          conditions: factsFor(facts),
        }).relations
        const direct = g.nodes.filter((n) => n.depth === 1)
        // In the frozen prior, targets can repeat by context. The view deduplicates
        // them for layout, while retaining the first applicable edge's status.
        const unique = [
          ...new Map(
            expected
              .slice()
              .reverse()
              .map((r) => [r.target, r]),
          ).values(),
        ]
        for (const n of direct) {
          const r = unique.find((r) => r.target === n.id)
          assert(r)
          assert.equal(n.status, r.applicability)
          assert.equal(n.negated, !!r.negated)
          assert.equal(n.type, r.type)
          relations++
        }
        assert.equal(direct.length, unique.length)
      }
    }
  }
  const result = {
    commit: DREAM_COMMIT,
    aliasContextConditionQueries: aliases,
    directRelationsCompared: relations,
    result: 'PASS',
    scope: 'frozen 21-concept / 23-relation prior; explainer-specific winner rule is not an Atlas feature',
  }
  await mkdir('docs/validation/dream-room', { recursive: true })
  await writeFile('docs/validation/dream-room/atlas-review.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
} finally {
  await server.close()
}
