import { formulaLines } from '../experiments/registry'
import { useRoom } from '../golden/room'
import { getController } from './LabController'

/**
 * What the lab tells the AI Guide (read when a question is asked): the running rule and the
 * step being looked at — the app's own computed values, so the AI need not guess them.
 */
export function labGuideContext(): Record<string, unknown> | null {
  if (useRoom.getState().open) return null // the room covers the lab
  const c = getController()
  const s = c.store.getState()
  if (s.film)
    return {
      page: 'π の模様（Film）',
      about:
        '2 本の腕をつなぎ、先の腕を根元の腕の π 倍の速さで回したときのペン先の軌跡 e^{it} + e^{iπt} を描く画面',
      step: s.currentStep,
    }
  const def = c.definition()
  const symbol = s.constant?.symbol ?? s.constantId
  const trace = s.inspected ?? s.currentTrace
  return {
    page: 'ラボ（実験画面）',
    experiment: def.name,
    view: def.view === '3d' ? '3D' : '2D',
    constant: `${symbol}（${s.constant?.precision ?? s.precision} 桁）`,
    rule: formulaLines(def, symbol),
    parameters: s.params,
    currentStep: s.currentStep,
    shownStep: s.viewStep ?? s.currentStep,
    comparingWith: s.compareConstant,
    ...(trace
      ? {
          inspectedStep: {
            step: trace.step,
            digit: trace.digit,
            values: Object.fromEntries(trace.evaluations.map((e) => [e.target, e.value])),
          },
        }
      : {}),
  }
}
