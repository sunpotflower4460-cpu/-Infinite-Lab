import { getController } from '../../app/LabController'
import { filmNumbers, PI_CONVERGENTS, stageFor, type FilmInfoLevel } from '../../film/explain'
import { useLab } from '../../state/labStore'
import { formatExact, formatInt } from '../../utils/format'
import { webCodecsAvailable } from '../../lab/video'
import { VideoStatus } from '../Status/VideoExport'

const LEVELS: { id: FilmInfoLevel; label: string }[] = [
  { id: 'simple', label: 'かんたん' },
  { id: 'expert', label: '専門' },
  { id: 'off', label: '説明なし' },
]

/**
 * Film mode overlay: the picture, plus as much explanation as the viewer asks for —
 * plain words for a first look ("π = 3.14…, two arms"), the exact mathematics for experts,
 * or nothing at all (like the reference video). A tap on the picture pauses / resumes.
 */
export function FilmOverlay() {
  const c = getController()
  const level = useLab((s) => s.filmInfo)
  const playing = useLab((s) => s.playing)
  const phase = useLab((s) => s.phase)
  const finished = useLab((s) => s.finished)
  const step = useLab((s) => s.currentStep)
  const dt = useLab((s) => (typeof s.params.dt === 'number' ? s.params.dt : 0))
  const { t, turns1, turns2 } = filmNumbers(step, dt)

  const hint =
    phase === 'computing'
      ? 'π の桁を計算中…'
      : finished
        ? '計算した桁の終わりまで描きました'
        : playing
          ? '画面をタップで一時停止'
          : '画面をタップで再生'

  return (
    <div className="film-overlay" data-testid="film">
      <button
        className="film-tap"
        aria-label={playing ? 'Pause film' : 'Play film'}
        onClick={() => c.toggleFilm()}
      />
      <div className="film-top">
        <div className="film-levels" role="radiogroup" aria-label="説明の詳しさ">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={level === l.id}
              className={level === l.id ? 'active' : ''}
              onClick={() => c.setFilmInfo(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <FilmSave />
        <button className="film-close" onClick={() => c.stopFilm()} aria-label="Close film">
          ✕
        </button>
      </div>

      {level === 'off' ? (
        <div className="film-caption">
          <div className="mono" data-testid="film-time">
            T = {t.toFixed(2)}
          </div>
          <div className="film-hint">{hint}</div>
        </div>
      ) : (
        <div className="film-panel" data-testid="film-panel">
          {level === 'simple' ? (
            <Simple turns1={turns1} turns2={turns2} t={t} />
          ) : (
            <Expert turns1={turns1} turns2={turns2} t={t} dt={dt} />
          )}
          <div className="film-hint">{hint}</div>
        </div>
      )}
    </div>
  )
}

function PiValue({ decimals }: { decimals: number }) {
  const value = useLab((s) => s.constant?.value ?? '3.14159265358979323846')
  return (
    <div className={`film-pi${decimals > 20 ? ' long' : ''}`} data-testid="film-pi">
      <span className="film-pi-symbol">π</span> ={' '}
      <span className="mono">{value.slice(0, decimals + 2)}…</span>
    </div>
  )
}

function Simple({ turns1, turns2, t }: { turns1: number; turns2: number; t: number }) {
  const stage = stageFor(turns1)
  return (
    <>
      <PiValue decimals={14} />
      <div className="film-sub">円周率 π の速さで回る 2 本の腕が描く線</div>
      <div className="film-counters" data-testid="film-counters">
        <div>
          <span>根元の腕</span>
          <b className="mono">
            {turns1.toFixed(1)}
            <small> 周</small>
          </b>
        </div>
        <div>
          <span>先の腕</span>
          <b className="mono">
            {turns2.toFixed(1)}
            <small> 周</small>
          </b>
        </div>
        <div>
          <span>先 ÷ 根元</span>
          <b className="mono">{turns1 > 0 ? (turns2 / turns1).toFixed(5) : '—'}</b>
        </div>
      </div>
      <p className="film-stage" data-testid="film-stage" data-stage={stage.id}>
        {stage.text}
      </p>
      <div className="film-time mono" data-testid="film-time">
        T = {t.toFixed(2)}
      </div>
    </>
  )
}

function Expert({ turns1, turns2, t, dt }: { turns1: number; turns2: number; t: number; dt: number }) {
  const trace = useLab((s) => s.currentTrace)
  const params = useLab((s) => s.params)
  const precision = useLab((s) => s.constant?.precision ?? s.precision)
  const algorithm = useLab((s) => s.constant?.algorithm ?? '')
  const sps = useLab((s) => s.stepsPerSecond)
  const n = trace?.step ?? 0
  const env = trace?.env ?? {}
  const value = (k: string) => (env[k] === undefined ? '—' : formatExact(env[k]!))
  return (
    <>
      <PiValue decimals={40} />
      <div className="film-math mono" data-testid="film-math">
        <div>
          z(t) = r₁·e<sup>iθ₁</sup> + r₂·e<sup>iθ₂</sup>, r₁ = {String(params.r1)}, r₂ = {String(params.r2)},
          ×{String(params.scale)}
        </div>
        <div>θ₁ = (n × dt) mod 2π = {value('theta1')}</div>
        <div>θ₂ = (n × dt × π) mod 2π = {value('theta2')}</div>
        <div>
          x[n] = {value('x')}, y[n] = {value('y')}
        </div>
        <div>
          n = {formatInt(n)}, dt = {dt}, t = n·dt = <span data-testid="film-time">{t.toFixed(2)}</span>
        </div>
        <div>
          周回 t/2π = {turns1.toFixed(3)}, πt/2π = {turns2.toFixed(3)}
        </div>
        <div>速さ {formatInt(Math.round(sps))} steps/s（映像と同じく指数的に加速）</div>
      </div>
      <table className="film-convergents mono" data-testid="film-convergents">
        <caption>π に近い分数（連分数の近似分数）: q 周でほぼ閉じ、p − q 回対称</caption>
        <thead>
          <tr>
            <th>p/q</th>
            <th>π − p/q</th>
            <th>対称</th>
            <th>q 周</th>
          </tr>
        </thead>
        <tbody>
          {PI_CONVERGENTS.map(({ p, q }) => (
            <tr key={q} className={turns1 >= q ? 'reached' : ''}>
              <td>
                {p}/{q}
              </td>
              <td>{(Math.PI - p / q).toExponential(2)}</td>
              <td>{p - q}</td>
              <td>{turns1 >= q ? '✓' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="film-notes">
        <li>
          π は {algorithm || 'Chudnovsky'} で {formatInt(precision)} 桁を BigInt
          で計算し、全桁が正しいことを誤差評価で保証。
        </li>
        <li>
          角度は BigInt で厳密に mod 2π（π を 448 bit ≈ 120 桁で使用）。n が大きくても誤差が積み重ならない。
        </li>
        <li>
          座標は IEEE-754 float64、sin/cos は決定的な実装（fdlibm
          移植）。同じ条件なら全端末でビット単位で同じ図形。
        </li>
        <li>
          参照動画はこの規則と矛盾しない（15 回対称の出現と消失）。「再現」とは断定しない —
          docs/reference/ANALYSIS.md。
        </li>
      </ul>
    </>
  )
}

/** Save what has been drawn so far as an MP4, with the film's accelerating pace. */
function FilmSave() {
  const c = getController()
  const video = useLab((s) => s.video)
  const step = useLab((s) => s.currentStep)
  if (!webCodecsAvailable()) return null
  const recording = video.status === 'recording'
  return (
    <div className="film-save">
      {recording ? (
        <button onClick={() => c.cancelVideo()} aria-label="Cancel video">
          {Math.round((100 * video.done) / video.total)}% ✕
        </button>
      ) : (
        <button
          onClick={() => void c.exportVideo({ format: 'mp4', seconds: 20, pace: 'film', glow: true })}
          disabled={step < 2}
          aria-label="Save film as video"
        >
          ⤓ 保存
        </button>
      )}
      {video.status === 'done' || video.status === 'error' ? (
        <div className="film-toast">
          <VideoStatus />
        </div>
      ) : null}
    </div>
  )
}
