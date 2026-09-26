import { CONSTANTS } from '../math/constants'
import { formulaLines, getExperiment, resolveExperiment } from '../experiments/registry'
import {
  checkSources,
  DEFAULT_SOURCES,
  PLAYGROUND_ID,
  type PlaygroundSources,
} from '../experiments/playground'
import {
  defaultParams,
  type DigitStart,
  type ExperimentDefinition,
  type ParamValue,
  type StepTrace,
} from '../experiments/core/types'
import type { GeometryInstruction } from '../geometry/types'
import { geometryDigest } from '../geometry/digest'
import { digitLimit, nextPrecision, type LabConfig } from '../lab/config'
import { FILE_FORMAT, FILE_VERSION, parseImport, type ExperimentFile } from '../lab/experimentFile'
import { geometryCsv, geometrySvg } from '../lab/exporters'
import { detectPatterns } from '../analysis/patterns'
import { askObserver, type DeepSeekModel } from '../ai/deepseek'
import { addHistory, browserStorage, loadHistory, removeHistory, type HistoryEntry } from '../lab/history'
import { PRESETS } from '../lab/presets'
import { PixiRenderer } from '../renderer/PixiRenderer'
import type { Look } from '../renderer/layers/GeometryLayer'
import { filmSpeed } from './filmSpeed'
import { saveFilmInfo, type FilmInfoLevel } from '../film/explain'
import { createLabStore, SPEEDS, useLab, type LabStore } from '../state/labStore'
import type { MathRequest, MathResponse, SimRequest, SimResponse } from '../workers/protocol'

import { version as APP_VERSION } from '../../package.json'

/**
 * Orchestrates:  math.worker (digits) → simulation.worker (geometry) → renderer, and mirrors
 * the observable state into the Zustand store for the UI. Holds no mathematics itself.
 */
export class LabController {
  readonly renderer = new PixiRenderer()
  private readonly mathWorker: Worker
  private readonly simWorker: Worker
  private mathRequestId = 0
  private inspectRequestId = 0
  private digits: Uint8Array | null = null
  /** Constant id / precision of `digits`. */
  private loaded: { constantId: string; precision: number } | null = null
  private statsTimer: ReturnType<typeof setInterval> | undefined
  private mounted = false
  /** Id of the latest `init` sent to the simulation worker; older `ready`s are ignored. */
  private initId = 0
  /**
   * Work to do once the simulation for a restored / imported config is ready: run to
   * `seek` and compare the geometry digest with `verify`. Cancelled by any manual change.
   */
  private pending: { seek: number | null; verify: string | null; note?: string } | null = null
  /** Explanation attached to the next verification result (older file formats). */
  private verifyNote: string | undefined
  /** Digest to verify once `seekTarget` has been reached. */
  private pendingVerify: string | null = null
  /** Forward seek in progress: the step we are computing up to. */
  private seekTarget: number | null = null
  /** Request id of an in-flight continuous-computation extension (null = none). */
  private extendRequestId: number | null = null
  /** Compare Mode: the second lane (same experiment, another constant). */
  peer: LabController | null = null
  private unsubscribeMirror: (() => void) | null = null
  /** Compare Mode playback clock (requestAnimationFrame id). */
  private clockFrame: number | null = null
  /** Incremented per AI request and per run; stale answers are dropped. */
  private aiRequestId = 0
  /** Latest requested inspection, posted at most once per frame (Timeline drags). */
  private queuedInspect: number | null = null

  constructor(readonly store: LabStore = useLab) {
    this.mathWorker = new Worker(new URL('../workers/math.worker.ts', import.meta.url), { type: 'module' })
    this.simWorker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.mathWorker.onmessage = (e: MessageEvent<MathResponse>) => this.onMath(e.data)
    this.simWorker.onmessage = (e: MessageEvent<SimResponse>) => this.onSim(e.data)
    this.renderer.onUserCamera = () => this.store.setState({ follow: false })
    this.renderer.onPick = (step) => this.onPicked(step)
    this.store.setState({ history: loadHistory(browserStorage()) })
  }

  async mount(host: HTMLElement): Promise<void> {
    if (this.mounted) return
    this.mounted = true
    await this.renderer.init(host)
    this.store.setState({
      backend: this.renderer.backend,
      layerMode: this.renderer.layerName.startsWith('Instanced') ? 'instanced' : 'graphics',
    })
    this.statsTimer = setInterval(
      () => this.store.setState({ fps: this.renderer.fps, renderMs: this.renderer.lastRenderMs }),
      500,
    )
    if (this.store.getState().phase === 'idle') this.computeConstant()
  }

  dispose(): void {
    this.disableCompare()
    if (this.statsTimer) clearInterval(this.statsTimer)
    this.mathWorker.terminate()
    this.simWorker.terminate()
    this.renderer.destroy()
  }

  // ---- configuration -----------------------------------------------------------

  computeConstant(): void {
    const { constantId, precision } = this.store.getState()
    const requestId = ++this.mathRequestId
    this.extendRequestId = null // a new computation supersedes any extension
    this.pause()
    this.store.setState({ phase: 'computing', error: null, extending: null })
    this.postMath({ type: 'compute', requestId, constantId, precision })
  }

  /** A manual change supersedes any pending restore / import and its verification. */
  private cancelPending(): void {
    this.pending = null
    this.pendingVerify = null
    this.store.setState({ verify: { status: 'idle' } })
  }

  setConstant(constantId: string): void {
    this.cancelPending()
    // a new constant starts from the precision the user picked, not an Infinite Mode extension
    this.store.setState((s) => ({ constantId, precision: s.chosenPrecision }))
    this.computeConstant()
  }

  setPrecision(precision: number): void {
    this.cancelPending()
    this.store.setState({ precision, chosenPrecision: precision })
    this.computeConstant()
  }

  setExperiment(experimentId: string): void {
    this.cancelPending()
    const def = getExperiment(experimentId)
    this.store.setState({ experimentId, params: defaultParams(def.parameters) })
    this.initSimulation()
  }

  setParam(key: string, value: ParamValue): void {
    this.cancelPending()
    this.store.setState((s) => ({ params: { ...s.params, [key]: value } }))
    this.initSimulation()
  }

  /** Formula Playground: run new formulas (all three must parse; the panel keeps drafts). */
  setFormulas(formulas: PlaygroundSources): void {
    const errors = checkSources(formulas)
    const first = Object.values(errors)[0]
    if (first) throw first
    this.cancelPending()
    this.store.setState({ formulas: { ...formulas } })
    this.initSimulation()
  }

  /** The definition being run (the Playground's is built from the current formulas). */
  definition(): ExperimentDefinition {
    const s = this.store.getState()
    return resolveExperiment(s.experimentId, s.formulas)
  }

  setDigitStart(digitStart: DigitStart): void {
    this.cancelPending()
    this.store.setState({ digitStart })
    this.initSimulation()
  }

  currentConfig(): LabConfig {
    const s = this.store.getState()
    return {
      constant: s.constantId,
      precision: s.precision,
      experiment: s.experimentId,
      digitStart: s.digitStart,
      parameters: { ...s.params },
      ...(s.experimentId === PLAYGROUND_ID ? { formulas: { ...s.formulas } } : {}),
    }
  }

  /** Apply a full configuration, then optionally run to `steps` and verify a digest. */
  applyConfig(config: LabConfig, steps?: number, expectedDigest?: string, note?: string): void {
    this.pendingVerify = null
    this.pending = { seek: steps && steps > 0 ? steps : null, verify: expectedDigest ?? null, note }
    this.store.setState({
      constantId: config.constant,
      precision: config.precision,
      chosenPrecision: config.precision,
      experimentId: config.experiment,
      digitStart: config.digitStart,
      params: { ...config.parameters },
      formulas: config.formulas ?? DEFAULT_SOURCES,
      verify: expectedDigest ? { status: 'running', expected: expectedDigest } : { status: 'idle' },
    })
    const loaded = this.loaded
    const computing = this.store.getState().phase === 'computing'
    if (
      computing ||
      !loaded ||
      loaded.constantId !== config.constant ||
      loaded.precision !== config.precision
    ) {
      // A computation in flight may be for another constant: always issue a new request.
      this.computeConstant()
    } else {
      this.initSimulation()
    }
  }

  applyPreset(id: string): void {
    const preset = PRESETS.find((p) => p.id === id)
    if (preset) this.applyConfig(preset.config)
  }

  // ---- playback -------------------------------------------------------------------

  play(): void {
    if (this.peer) {
      this.startLockstep()
      return
    }
    const s = this.store.getState()
    if (s.phase !== 'ready' || s.finished) return
    this.leaveView()
    this.clearVerifiedBadge()
    this.postSim({ type: 'play', stepsPerSecond: SPEEDS[s.speedIndex]!.stepsPerSecond })
  }

  pause(): void {
    this.stopLockstep()
    this.postSim({ type: 'pause' })
    this.peer?.postSim({ type: 'pause' })
  }

  /** Whether Play would start anything (also covers Compare Mode's lockstep limits). */
  canPlay(): boolean {
    const a = this.store.getState()
    if (a.phase !== 'ready') return false
    if (!this.peer) return !a.finished
    const b = this.peer.store.getState()
    if (b.phase !== 'ready') return false
    return Math.max(a.currentStep, b.currentStep) < Math.min(a.totalSteps, b.totalSteps)
  }

  togglePlay(): void {
    const s = this.store.getState()
    if (s.playing || s.lockstepPlaying) this.pause()
    else if (this.canPlay()) this.play()
  }

  step(count = 1): void {
    if (this.peer) {
      this.seek(Math.max(this.store.getState().currentStep, this.peer.store.getState().currentStep) + count)
      return
    }
    if (this.store.getState().phase !== 'ready') return
    this.leaveView()
    this.clearVerifiedBadge()
    this.postSim({ type: 'step', count })
  }

  reset(): void {
    this.stopLockstep()
    this.cancelPending()
    this.postSim({ type: 'reset' })
    this.peer?.reset()
  }

  /** A finished verification describes the geometry at that moment; drop it once it moves on. */
  private clearVerifiedBadge(): void {
    const v = this.store.getState().verify
    if (v.status === 'verified' || v.status === 'mismatch')
      this.store.setState({ verify: { status: 'idle' } })
  }

  setSpeed(speedIndex: number): void {
    this.store.setState({ speedIndex })
    this.postSim({ type: 'setSpeed', stepsPerSecond: SPEEDS[speedIndex]!.stepsPerSecond })
  }

  /**
   * Timeline: show the structure as it was at `step`. Going back only hides later geometry
   * (nothing is recomputed); going beyond the computed head computes the missing steps.
   */
  seek(step: number, options: { inspect?: boolean } = {}): void {
    this.stopLockstep() // a Timeline move pauses Compare playback, like it pauses a single lane
    this.seekLane(step, options)
    this.peer?.seekLane(step, options)
  }

  /** Seek this lane only. */
  private seekLane(step: number, options: { inspect?: boolean } = {}): void {
    const s = this.store.getState()
    if (s.phase !== 'ready') return
    const target = Math.max(0, Math.min(Math.round(step), s.totalSteps))
    if (target > s.currentStep) {
      this.leaveView()
      this.seekTarget = target
      // The worker counts from its own step (batches may still be in flight), so it stops
      // playback and computes exactly up to `target`.
      this.postSim({ type: 'seekTo', step: target })
      return
    }
    if (s.playing) this.pause()
    const view = target === s.currentStep ? null : target
    this.store.setState({ viewStep: view })
    this.renderer.setVisibleStep(view ?? Infinity)
    if (options.inspect === false) return
    if (target >= 1) this.queueInspect(target)
    else {
      this.store.setState({ inspected: null })
      this.renderer.setHighlight(null)
    }
  }

  /** Coalesce inspections to one per frame, so a fast Timeline drag doesn't flood the worker. */
  private queueInspect(step: number): void {
    const first = this.queuedInspect === null
    this.queuedInspect = step
    if (!first) return
    requestAnimationFrame(() => {
      const target = this.queuedInspect
      this.queuedInspect = null
      if (target !== null) this.inspect(target)
    })
  }

  private leaveView(): void {
    if (this.store.getState().viewStep === null) return
    this.store.setState({ viewStep: null, inspected: null })
    this.renderer.setVisibleStep(Infinity)
  }

  // ---- inspection ------------------------------------------------------------------

  inspect(step: number): void {
    this.postSim({ type: 'inspect', requestId: ++this.inspectRequestId, step })
  }

  /** A click in either lane inspects that step in both (same step, different constant). */
  private onPicked(step: number | null): void {
    if (step !== null && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches) {
      ;(this.owner ?? this).store.setState({ sheet: 'inspector' })
    }
    const lanes = this.peer ? [this, this.peer] : this.owner ? [this.owner, this] : [this]
    for (const lane of lanes) {
      if (step === null) lane.clearInspection()
      else lane.inspect(step)
    }
  }

  /** For a Compare Mode lane: the main lab that owns it. */
  private owner: LabController | null = null

  // ---- Compare Mode -------------------------------------------------------------------

  /**
   * Compare Mode (spec §26): a second lane runs the same experiment, parameters, precision
   * and steps with another constant. Playback advances both lanes in lockstep.
   */
  enableCompare(constantId: string): LabController {
    this.stopLockstep()
    this.setContinuous(false)
    this.pause()
    let peer = this.peer
    if (!peer) {
      peer = new LabController(createLabStore())
      peer.owner = this
      peer.setLayerMode(this.store.getState().layerMode)
      this.peer = peer
      this.unsubscribeMirror = this.store.subscribe((s, prev) => {
        if (
          s.experimentId !== prev.experimentId ||
          s.params !== prev.params ||
          s.formulas !== prev.formulas ||
          s.digitStart !== prev.digitStart ||
          s.precision !== prev.precision
        ) {
          this.stopLockstep()
          this.peer?.applyConfig({
            ...this.currentConfig(),
            constant: this.store.getState().compareConstant ?? 'e',
          })
        }
      })
    }
    this.store.setState({ compareConstant: constantId })
    peer.applyConfig({ ...this.currentConfig(), constant: constantId })
    // restart the main lane too, so both start from step 0 under identical conditions
    this.initSimulation()
    return peer
  }

  // ---- Film mode (the reference video's presentation) ------------------------------------

  /** Film clock: accumulated playing time (ms) and the moment it last resumed. */
  private film = { elapsed: 0, resumedAt: 0, timer: undefined as ReturnType<typeof setInterval> | undefined }
  private filmPending = false

  /**
   * Full-screen playback of the rule found in the reference video (π Film preset): white glow,
   * fixed framing on the whole disc, and a speed that grows like the video's. Presentation
   * only — the geometry is the Two-Arm Rotation's, bit for bit.
   */
  startFilm(): void {
    setHash('#film')
    this.disableCompare()
    this.setContinuous(false)
    this.stopFilmClock()
    this.film.elapsed = 0
    this.store.setState({ film: true, look: 'luminous', follow: false, sheet: null })
    this.renderer.setLook('luminous')
    this.renderer.setHighlight(null)
    const preset = PRESETS.find((p) => p.id === 'pi-film')!
    const p = preset.config.parameters
    const reach = ((p.r1 as number) + (p.r2 as number)) * (p.scale as number) // |z| ≤ (r1 + r2)·scale
    this.renderer.fitTo({ minX: -reach, minY: -reach, maxX: reach, maxY: reach })
    this.filmPending = true
    this.applyConfig(preset.config)
  }

  stopFilm(): void {
    setHash('#lab') // a reload stays in the lab
    this.filmPending = false
    this.stopFilmClock()
    this.pause()
    this.store.setState({ film: false, look: 'lab' })
    this.renderer.setLook('lab')
    this.fitAll()
  }

  /** Pause / resume the film (tap on the picture). */
  toggleFilm(): void {
    if (!this.store.getState().film) return
    if (this.film.timer !== undefined) {
      this.stopFilmClock()
      this.pause()
    } else if (!this.store.getState().finished) {
      this.startFilmClock()
    }
  }

  /** Film explanations: plain / expert / none (remembered in this browser). */
  setFilmInfo(level: FilmInfoLevel): void {
    saveFilmInfo(level)
    this.store.setState({ filmInfo: level })
    if (level === 'off') this.renderer.setHighlight(null)
    else if (this.store.getState().film)
      this.renderer.setHighlight(this.store.getState().currentTrace?.overlay ?? null)
  }

  setLook(look: Look): void {
    this.store.setState({ look })
    this.renderer.setLook(look)
  }

  private startFilmClock(): void {
    const s = this.store.getState()
    if (s.phase !== 'ready' || s.finished) return
    this.leaveView()
    this.film.resumedAt = performance.now()
    this.postSim({ type: 'play', stepsPerSecond: filmSpeed(this.film.elapsed / 1000) })
    this.film.timer = setInterval(() => {
      if (this.store.getState().finished) {
        this.stopFilmClock()
        return
      }
      const t = (this.film.elapsed + performance.now() - this.film.resumedAt) / 1000
      this.postSim({ type: 'setSpeed', stepsPerSecond: filmSpeed(t) })
    }, 200)
  }

  private stopFilmClock(): void {
    if (this.film.timer === undefined) return
    clearInterval(this.film.timer)
    this.film.timer = undefined
    this.film.elapsed += performance.now() - this.film.resumedAt
  }

  /** Whether the film is running (for the overlay's play / pause hint). */
  get filmRunning(): boolean {
    return this.film.timer !== undefined
  }

  disableCompare(): void {
    this.stopLockstep()
    this.unsubscribeMirror?.()
    this.unsubscribeMirror = null
    const peer = this.peer
    this.peer = null
    peer?.dispose()
    this.store.setState({ compareConstant: null })
  }

  private startLockstep(): void {
    const peer = this.peer
    if (!peer || this.clockFrame !== null) return
    const a = this.store.getState()
    const b = peer.store.getState()
    if (a.phase !== 'ready' || b.phase !== 'ready') return
    const limit = Math.min(a.totalSteps, b.totalSteps)
    let target = Math.max(a.currentStep, b.currentStep)
    if (target >= limit) return
    // bring a lagging lane (e.g. after a restore that only moved one lane) to the common start
    if (a.currentStep < target || a.viewStep !== null) this.seekLane(target)
    if (b.currentStep < target || b.viewStep !== null) peer.seekLane(target)
    let last = performance.now()
    let carry = 0
    this.store.setState({ lockstepPlaying: true })
    const tick = () => {
      if (!this.peer) return this.stopLockstep()
      const now = performance.now()
      const dt = now - last
      last = now
      const sa = this.store.getState()
      const sb = this.peer.store.getState()
      if (sa.phase !== 'ready' || sb.phase !== 'ready') return this.stopLockstep()
      // advance only when both lanes have reached the previous target (natural back-pressure)
      if (sa.currentStep >= target && sb.currentStep >= target) {
        if (target >= limit) return this.stopLockstep()
        const sps = SPEEDS[sa.speedIndex]!.stepsPerSecond
        let inc: number
        if (Number.isFinite(sps)) {
          carry = Math.min(carry + (sps * dt) / 1000, sps * 0.25 + 1)
          inc = Math.floor(carry)
          carry -= inc
        } else inc = 5000
        if (inc > 0) {
          target = Math.min(limit, target + inc)
          this.seekLane(target)
          this.peer.seekLane(target)
        }
      }
      this.clockFrame = requestAnimationFrame(tick)
    }
    this.clockFrame = requestAnimationFrame(tick)
  }

  private stopLockstep(): void {
    if (this.clockFrame !== null) cancelAnimationFrame(this.clockFrame)
    this.clockFrame = null
    if (this.store.getState().lockstepPlaying) this.store.setState({ lockstepPlaying: false })
  }

  clearInspection(): void {
    const s = this.store.getState()
    if (s.viewStep !== null) {
      // keep showing the viewed step
      this.inspect(s.viewStep)
      return
    }
    this.store.setState({ inspected: null })
    this.renderer.setHighlight(highlightOf(s.currentTrace))
  }

  // ---- view ---------------------------------------------------------------------------

  fitAll(): void {
    this.renderer.follow = true
    this.renderer.fitAll()
    this.store.setState({ follow: true })
  }

  center(): void {
    this.renderer.center()
  }

  setScientific(scientific: boolean): void {
    this.store.setState({ scientific })
  }

  /** Infinite Mode (spec §37): continuous computation until paused (up to digitLimit() digits). */
  setContinuous(on: boolean): void {
    this.store.setState({ continuous: on })
    this.postSim({ type: 'setContinuous', on })
    if (on) this.maybeExtend()
  }

  /** Start computing more digits once half of the current ones are used (or playback waits). */
  private maybeExtend(): void {
    const s = this.store.getState()
    const loaded = this.loaded
    if (!s.continuous || s.phase !== 'ready' || this.extendRequestId !== null || !loaded) return
    if (loaded.precision >= digitLimit() || loaded.constantId !== s.constantId) {
      // No extension can come: let a waiting worker finish instead of waiting forever.
      if (s.waiting) this.postSim({ type: 'setContinuous', on: false })
      return
    }
    if (!s.waiting && s.currentStep < s.totalSteps / 2) return
    const to = nextPrecision(loaded.precision)
    const requestId = ++this.mathRequestId
    this.extendRequestId = requestId
    this.store.setState({ extending: { from: loaded.precision, to } })
    this.postMath({ type: 'compute', requestId, constantId: loaded.constantId, precision: to })
  }

  private onExtension(msg: MathResponse): void {
    this.extendRequestId = null
    this.store.setState({ extending: null })
    if (msg.type === 'error') {
      this.endContinuous(`extension failed: ${msg.message}`)
      return
    }
    const s = this.store.getState()
    const old = this.digits
    if (!old || !this.loaded || msg.constantId !== this.loaded.constantId || msg.constantId !== s.constantId)
      return
    for (let i = 0; i < old.length; i++) {
      if (msg.digits[i] !== old[i]) {
        this.endContinuous(`extension changed digit ${i}; refusing to continue`)
        return
      }
    }
    this.digits = msg.digits
    this.loaded = { constantId: msg.constantId, precision: msg.precision }
    this.store.setState({
      precision: msg.precision,
      constant: s.constant && {
        ...s.constant,
        value: msg.value,
        digits: msg.value.replace('.', ''),
        precision: msg.precision,
        computeTimeMs: msg.computeTimeMs,
      },
    })
    const copy = msg.digits.slice()
    this.postSim({ type: 'extend', digits: copy }, [copy.buffer])
  }

  /** Leave Infinite Mode after a failed extension (no retry loop, no endless waiting). */
  private endContinuous(error: string): void {
    this.store.setState({ continuous: false, error })
    this.postSim({ type: 'setContinuous', on: false })
  }

  setLayerMode(layerMode: 'instanced' | 'graphics'): void {
    this.renderer.setLayerMode(layerMode)
    // report what is actually used (instanced falls back to Graphics without WebGL)
    this.store.setState({
      layerMode: this.renderer.layerName.startsWith('Instanced') ? 'instanced' : 'graphics',
    })
    this.peer?.setLayerMode(layerMode)
  }

  // ---- history / export / import --------------------------------------------------------

  async saveToHistory(): Promise<void> {
    try {
      await this.saveToHistoryUnsafe()
    } catch (err) {
      this.reportError('save failed', err)
    }
  }

  private reportError(what: string, err: unknown): void {
    this.store.setState({
      verify: { status: 'error', message: `${what}: ${err instanceof Error ? err.message : String(err)}` },
    })
  }

  private async saveToHistoryUnsafe(): Promise<void> {
    const s = this.store.getState()
    const entry: HistoryEntry = {
      id: `${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`,
      timestamp: new Date().toISOString(),
      config: this.currentConfig(),
      steps: s.currentStep,
      digest: await geometryDigest(this.renderer.store, this.renderer.store.count),
    }
    this.store.setState({ history: addHistory(browserStorage(), entry) })
  }

  restoreHistory(id: string): void {
    const entry = this.store.getState().history.find((e) => e.id === id)
    if (entry) this.applyConfig(entry.config, entry.steps, entry.digest)
  }

  deleteHistory(id: string): void {
    this.store.setState({ history: removeHistory(browserStorage(), id) })
  }

  /** Build the reproducible JSON record of the current experiment (spec §28). */
  async buildExport(): Promise<ExperimentFile> {
    const s = this.store.getState()
    const def = this.definition()
    return {
      format: FILE_FORMAT,
      version: FILE_VERSION,
      createdAt: new Date().toISOString(),
      app: { name: 'π Infinite Lab', version: APP_VERSION },
      config: this.currentConfig(),
      steps: s.currentStep,
      constant: {
        symbol: s.constant?.symbol ?? '',
        algorithm: s.constant?.algorithm ?? '',
        precision: s.constant?.precision ?? s.precision,
      },
      formulas: formulaLines(def, s.constant?.symbol ?? 'C'),
      result: {
        geometryRecords: this.renderer.store.count,
        geometrySha256: await geometryDigest(this.renderer.store, this.renderer.store.count),
        finalState: s.currentTrace?.env ?? {},
      },
      notes: [
        'Digits are computed with BigInt and truncated; every reported digit is certified by an error bound.',
        'Geometry is evaluated in IEEE-754 float64 with deterministic (fdlibm-port) sin/cos.',
        'geometrySha256 covers all records as little-endian float64 [kind, step, a, b, c, d, e].',
        'Re-running config for `steps` steps must reproduce geometrySha256 exactly.',
      ],
    }
  }

  async exportJson(): Promise<void> {
    try {
      await this.exportJsonUnsafe()
    } catch (err) {
      this.reportError('export failed', err)
    }
  }

  private async exportJsonUnsafe(): Promise<void> {
    const file = await this.buildExport()
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    this.download(
      blob,
      `pi-infinite-lab_${file.config.experiment}_${file.config.constant}_${file.steps}.json`,
    )
  }

  private fileStem(): string {
    const s = this.store.getState()
    const step = s.viewStep ?? s.currentStep
    return `pi-infinite-lab_${s.experimentId}_${s.constantId}_${step}`
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  /** Export the view as PNG, or the (Timeline-visible) geometry as SVG / CSV with exact values. */
  async exportAs(format: 'png' | 'svg' | 'csv'): Promise<void> {
    try {
      const s = this.store.getState()
      const count = this.renderer.visibleRecords
      if (format === 'png') {
        this.download(await this.renderer.snapshotPng(), `${this.fileStem()}.png`)
      } else if (format === 'csv') {
        this.download(
          new Blob(geometryCsv(this.renderer.store, count), { type: 'text/csv' }),
          `${this.fileStem()}.csv`,
        )
      } else {
        const def = this.definition()
        const symbol = s.constant?.symbol ?? 'C'
        const desc = [
          `${symbol} (${s.constant?.precision ?? s.precision} digits, ${s.constant?.algorithm ?? ''})`,
          `${def.name}, step ${s.viewStep ?? s.currentStep}`,
          ...formulaLines(def, symbol),
          `parameters ${JSON.stringify(s.params)}`,
        ].join('\n')
        const parts = geometrySvg(this.renderer.store, count, `π Infinite Lab — ${def.name}`, desc)
        this.download(new Blob(parts, { type: 'image/svg+xml' }), `${this.fileStem()}.svg`)
      }
    } catch (err) {
      this.reportError(`${format.toUpperCase()} export failed`, err)
    }
  }

  // ---- Pattern Detection / AI Observer -----------------------------------------------------

  /** Measure the geometry shown now (Timeline-aware). Deterministic facts only. */
  measurePatterns(): void {
    const s = this.store.getState()
    const step = s.viewStep ?? s.currentStep
    const count = this.renderer.visibleRecords
    let consumed: Uint8Array | undefined
    if (this.digits && s.constant) {
      const start = s.digitStart === 'fractional' ? s.constant.integerPartLength : 0
      consumed = this.digits.subarray(start, start + step)
    }
    this.store.setState({ patterns: { facts: detectPatterns(this.renderer.store, count, consumed), step } })
  }

  /**
   * Ask DeepSeek for observations about the measured facts. The answer is stored as a
   * conjecture; the key is used only for this request and never stored elsewhere.
   */
  async askAi(apiKey: string, model: DeepSeekModel, baseUrl?: string): Promise<void> {
    this.measurePatterns() // always measure what is shown now (never reuse facts of another run)
    const requestId = ++this.aiRequestId
    const s = this.store.getState()
    const def = this.definition()
    this.store.setState({ ai: { status: 'asking' } })
    try {
      const answer = await askObserver(
        {
          experiment: `${def.name} (${def.id})`,
          constant: `${s.constant?.symbol ?? s.constantId} (${s.constant?.name ?? ''})`,
          precision: s.constant?.precision ?? s.precision,
          steps: s.patterns!.step,
          parameters: s.params,
          formulas: formulaLines(def, s.constant?.symbol ?? 'C'),
          facts: s.patterns!.facts,
        },
        { apiKey, model, baseUrl },
      )
      if (requestId === this.aiRequestId) this.store.setState({ ai: { status: 'done', answer } })
    } catch (err) {
      if (requestId !== this.aiRequestId) return
      this.store.setState({
        ai: { status: 'error', error: err instanceof Error ? err.message : String(err) },
      })
    }
  }

  importJson(text: string): void {
    try {
      const parsed = parseImport(text)
      this.applyConfig(parsed.config, parsed.steps, parsed.expectedDigest, parsed.compatibilityNote)
    } catch (err) {
      this.store.setState({
        verify: { status: 'error', message: err instanceof Error ? err.message : String(err) },
      })
    }
  }

  private async verifyIfPending(): Promise<void> {
    const expected = this.pendingVerify
    if (!expected) return
    this.pendingVerify = null
    const actual = await geometryDigest(this.renderer.store, this.renderer.store.count)
    const status = actual === expected ? 'verified' : 'mismatch'
    const note = status === 'mismatch' ? this.verifyNote : undefined
    this.verifyNote = undefined
    this.store.setState({ verify: { status, expected, actual, note } })
  }

  // ---- worker plumbing ---------------------------------------------------------

  private postMath(msg: MathRequest): void {
    this.mathWorker.postMessage(msg)
  }

  private postSim(msg: SimRequest, transfer: Transferable[] = []): void {
    this.simWorker.postMessage(msg, transfer)
  }

  private initSimulation(): void {
    const s = this.store.getState()
    // While new digits are being computed, keep the choice in the store only;
    // onMath() starts the simulation with the new digits and the current settings.
    if (!this.digits || !s.constant || s.phase === 'computing') return
    const c = CONSTANTS[s.constantId]!
    // Copy: the main thread keeps its digits for display; the worker owns its own buffer.
    const digits = this.digits.slice()
    this.postSim(
      {
        type: 'init',
        initId: ++this.initId,
        experimentId: s.experimentId,
        params: s.params,
        ...(s.experimentId === PLAYGROUND_ID ? { formulas: s.formulas } : {}),
        digitStart: s.digitStart,
        digits,
        integerPartLength: s.constant.integerPartLength,
        constant: { id: c.id, symbol: c.symbol },
      },
      [digits.buffer],
    )
    this.postSim({ type: 'setContinuous', on: s.continuous })
  }

  private onMath(msg: MathResponse): void {
    if (msg.requestId === this.extendRequestId) {
      this.onExtension(msg)
      return
    }
    if (msg.requestId !== this.mathRequestId) return // superseded
    if (msg.type === 'error') {
      this.store.setState({ phase: 'error', error: msg.message })
      return
    }
    const want = this.store.getState()
    if (msg.constantId !== want.constantId || msg.precision !== want.precision) {
      this.computeConstant() // selection changed without a new request: never show mismatched digits
      return
    }
    const c = CONSTANTS[msg.constantId]!
    this.digits = msg.digits
    this.loaded = { constantId: msg.constantId, precision: msg.precision }
    this.store.setState({
      phase: 'ready',
      constant: {
        id: c.id,
        name: c.name,
        symbol: c.symbol,
        value: msg.value,
        digits: msg.value.replace('.', ''),
        precision: msg.precision,
        integerPartLength: msg.integerPartLength,
        algorithm: msg.algorithm,
        computeTimeMs: msg.computeTimeMs,
      },
    })
    this.initSimulation()
  }

  private resetView(): void {
    this.aiRequestId++ // an answer still in flight belongs to the previous run
    this.store.setState({ patterns: null, ai: { status: 'idle' } })
    this.renderer.clear()
    this.seekTarget = null
    this.store.setState({
      currentStep: 0,
      objects: 0,
      currentTrace: null,
      inspected: null,
      viewStep: null,
      finished: false,
      playing: false,
      waiting: false,
      follow: true,
      stepsPerSecond: 0,
    })
  }

  private onSim(msg: SimResponse): void {
    switch (msg.type) {
      case 'ready': {
        // Only the ready of the latest init counts (config changes may be queued behind it).
        if (msg.initId !== this.initId || this.store.getState().phase === 'computing') return
        this.resetView()
        // a new run replaces a failed one (e.g. corrected Playground formulas)
        this.store.setState({ phase: 'ready', totalSteps: msg.totalSteps, error: null })
        if (this.filmPending) {
          this.filmPending = false
          this.startFilmClock()
        }
        const pending = this.pending
        this.pending = null
        if (pending?.verify) {
          this.pendingVerify = pending.verify
          this.verifyNote = pending.note
        }
        if (pending?.seek) this.seek(pending.seek)
        else void this.verifyIfPending() // e.g. a 0-step file
        break
      }
      case 'reset':
        this.resetView()
        break
      case 'batch': {
        this.renderer.append({ data: msg.data, count: msg.count })
        this.postSim({ type: 'ack', generation: msg.generation })
        const inspected = this.store.getState().inspected
        if (msg.trace && !inspected) {
          const st = this.store.getState()
          // Film mode: the arms as a guide (unless explanations are off, like the reference video)
          if (!st.film) this.renderer.setHighlight(highlightOf(msg.trace))
          else this.renderer.setHighlight(st.filmInfo === 'off' ? null : (msg.trace.overlay ?? null))
        }
        this.store.setState({
          currentStep: msg.currentStep,
          totalSteps: msg.totalSteps,
          objects: this.renderer.objectCount,
          currentTrace: msg.trace ?? this.store.getState().currentTrace,
          finished: msg.finished,
          stepsPerSecond: msg.stepsPerSecond,
          lastBatchMs: msg.computeMs,
        })
        this.maybeExtend()
        if (this.seekTarget !== null && (msg.currentStep >= this.seekTarget || msg.finished)) {
          const target = this.seekTarget
          this.seekTarget = null
          // Batches from before the seek can carry the worker past the target: show the target.
          if (msg.currentStep > target) this.seek(target)
          else void this.verifyIfPending()
        }
        break
      }
      case 'status':
        this.store.setState({
          playing: msg.playing,
          finished: msg.finished,
          currentStep: msg.currentStep,
          waiting: msg.waiting ?? false,
        })
        if (msg.waiting) this.maybeExtend()
        if (this.seekTarget !== null && !msg.playing && msg.currentStep >= this.seekTarget) {
          // seekTo found the worker already at / past the target (no batch was needed)
          const target = this.seekTarget
          this.seekTarget = null
          if (msg.currentStep > target) this.seek(target)
          else void this.verifyIfPending()
        }
        break
      case 'inspect':
        if (msg.requestId !== this.inspectRequestId) return
        if (msg.trace) {
          this.store.setState({ inspected: msg.trace })
          this.renderer.setHighlight(highlightOf(msg.trace))
        }
        break
      case 'extended':
        this.store.setState({ totalSteps: msg.totalSteps, finished: false })
        break
      case 'error':
        this.store.setState({ phase: 'error', error: msg.message, playing: false })
        break
    }
  }
}

/** Reflect the screen in the URL without adding history entries or firing hashchange. */
function setHash(hash: '#film' | '#lab'): void {
  if (typeof window === 'undefined' || window.location.hash === hash) return
  try {
    window.history.replaceState(window.history.state, '', hash)
  } catch {
    // sandboxed frames may refuse; the screen itself still switches
  }
}

let instance: LabController | undefined
export function getController(): LabController {
  instance ??= new LabController()
  return instance
}

/** Geometry of a step plus its transient overlay (e.g. the arms of Two-Arm Rotation). */
function highlightOf(trace: StepTrace | null | undefined): GeometryInstruction[] | null {
  return trace ? [...trace.instructions, ...(trace.overlay ?? [])] : null
}
