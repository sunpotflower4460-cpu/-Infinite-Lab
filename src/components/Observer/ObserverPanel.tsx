import { useState } from 'react'
import { getController } from '../../app/LabController'
import {
  DEEPSEEK_DEFAULT_BASE,
  DEEPSEEK_MODELS,
  loadApiKey,
  saveApiKey,
  type DeepSeekModel,
} from '../../ai/deepseek'
import { useLab } from '../../state/labStore'
import { formatExact, formatInt } from '../../utils/format'

/** χ² critical value for 9 degrees of freedom at the 5 % level. */
const CHI2_9_05 = 16.919

/**
 * Pattern Detection (measured facts) and AI Observer (conjectures), kept visibly apart (spec §38).
 */
export function ObserverPanel() {
  const c = getController()
  const patterns = useLab((s) => s.patterns)
  const ai = useLab((s) => s.ai)
  const ready = useLab((s) => s.phase === 'ready')
  const step = useLab((s) => s.viewStep ?? s.currentStep)
  const [key, setKey] = useState(loadApiKey)
  const [model, setModel] = useState<DeepSeekModel>('deepseek-chat')
  const [base, setBase] = useState(DEEPSEEK_DEFAULT_BASE)
  const f = patterns?.facts
  const stale = patterns !== null && patterns.step !== step

  return (
    <div className="observer" data-testid="observer">
      <div className="panel-title">Patterns (measured)</div>
      <div className="observer-row">
        <button onClick={() => c.measurePatterns()} disabled={!ready || step === 0}>
          Measure patterns
        </button>
        <span className="muted small">at step {formatInt(step)}</span>
      </div>
      {f && (
        <div className={`facts mono${stale ? ' stale' : ''}`} data-testid="facts">
          {stale && <div className="muted small">measured at step {formatInt(patterns!.step)}</div>}
          <div>
            objects {formatInt(f.records)} · steps {formatInt(f.steps)}
          </div>
          <div>
            centroid ({formatExact(f.centroid.x)}, {formatExact(f.centroid.y)})
          </div>
          <div>
            radius of gyration {f.radiusOfGyration.toPrecision(6)} · max radius {f.maxRadius.toPrecision(6)}
          </div>
          <div>
            symmetry{' '}
            {f.symmetry.some((s) => s.significant)
              ? f.symmetry
                  .filter((s) => s.significant)
                  .map((s) => `${s.order}-fold ${s.strength.toFixed(3)}`)
                  .join(' · ')
              : 'no significant rotational symmetry'}{' '}
            <span className="muted">(background {f.symmetryBackground.toFixed(3)})</span>
          </div>
          <div>
            near returns to step 1{' '}
            {f.nearReturns.length ? f.nearReturns.map((r) => formatInt(r.step)).join(', ') : 'none'} (±
            {f.returnTolerance.toPrecision(3)})
          </div>
          {f.digits && (
            <div>
              digits {f.digits.counts.join(' ')} · χ²(9) = {f.digits.chiSquare.toFixed(2)}{' '}
              <span className="muted">
                ({f.digits.chiSquare > CHI2_9_05 ? 'above' : 'below'} the 5 % critical value {CHI2_9_05})
              </span>
            </div>
          )}
        </div>
      )}

      <div className="panel-title">AI Observer (DeepSeek)</div>
      <p className="muted small">
        The key stays in this browser and is sent only to the endpoint below. AI output is a conjecture, not a
        proof.
      </p>
      <input
        type="password"
        className="mono"
        placeholder="DeepSeek API key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onBlur={() => saveApiKey(key.trim())}
        aria-label="DeepSeek API key"
        autoComplete="off"
      />
      <div className="observer-row">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as DeepSeekModel)}
          aria-label="AI model"
        >
          {DEEPSEEK_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            saveApiKey(key.trim())
            void c.askAi(key, model, base)
          }}
          disabled={!ready || step === 0 || !key.trim() || ai.status === 'asking'}
        >
          {ai.status === 'asking' ? 'Asking…' : 'Ask AI'}
        </button>
      </div>
      <details className="small">
        <summary className="muted">endpoint</summary>
        <input
          className="mono"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          aria-label="AI endpoint"
        />
      </details>
      {ai.status === 'error' && <div className="error small">{ai.error}</div>}
      {ai.status === 'done' && ai.answer && (
        <div className="ai-answer" data-testid="ai-answer">
          <div className="badge">AI の推測（未検証）</div>
          <div className="ai-text">{ai.answer.text}</div>
          <div className="muted small">
            {ai.answer.model} · {new Date(ai.answer.createdAt).toLocaleString()} · 数学的な証明ではありません
          </div>
        </div>
      )}
    </div>
  )
}
