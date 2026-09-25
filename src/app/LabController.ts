import { CONSTANTS } from '../math/constants'
import { formulaLines, getExperiment } from '../experiments/registry'
import { defaultParams, type DigitStart, type ParamValue } from '../experiments/core/types'
import { geometryDigest } from '../geometry/digest'
import type { LabConfig } from '../lab/config'
import { FILE_FORMAT, FILE_VERSION, parseImport, type ExperimentFile } from '../lab/experimentFile'
import { addHistory, browserStorage, loadHistory, removeHistory, type HistoryEntry } from '../lab/history'
import { PRESETS } from '../lab/presets'
import { PixiRenderer } from '../renderer/PixiRenderer'
import { SPEEDS, useLab } from '../state/labStore'
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
  private pending: { seek: number | null; verify: string | null } | null = null
  /** Digest to verify once `seekTarget` has been reached. */
  private pendingVerify: string | null = null
  /** Forward seek in progress: the step we are computing up to. */
  private seekTarget: number | null = null
  /** Latest requested inspection, posted at most once per frame (Timeline drags). */
  private queuedInspect: number | null = null

  constructor() {
    this.mathWorker = new Worker(new URL('../workers/math.worker.ts', import.meta.url), { type: 'module' })
    this.simWorker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.mathWorker.onmessage = (e: MessageEvent<MathResponse>) => this.onMath(e.data)
    this.simWorker.onmessage = (e: MessageEvent<SimResponse>) => this.onSim(e.data)
    this.renderer.onUserCamera = () => useLab.setState({ follow: false })
    this.renderer.onPick = (step) => (step === null ? this.clearInspection() : this.inspect(step))
    useLab.setState({ history: loadHistory(browserStorage()) })
  }

  async mount(host: HTMLElement): Promise<void> {
    if (this.mounted) return
    this.mounted = true
    await this.renderer.init(host)
    this.statsTimer = setInterval(
      () => useLab.setState({ fps: this.renderer.fps, renderMs: this.renderer.lastRenderMs }),
      500,
    )
    this.computeConstant()
  }

  dispose(): void {
    if (this.statsTimer) clearInterval(this.statsTimer)
    this.mathWorker.terminate()
    this.simWorker.terminate()
    this.renderer.destroy()
  }

  // ---- configuration -----------------------------------------------------------

  computeConstant(): void {
    const { constantId, precision } = useLab.getState()
    const requestId = ++this.mathRequestId
    this.pause()
    useLab.setState({ phase: 'computing', error: null })
    this.postMath({ type: 'compute', requestId, constantId, precision })
  }

  /** A manual change supersedes any pending restore / import and its verification. */
  private cancelPending(): void {
    this.pending = null
    this.pendingVerify = null
    useLab.setState({ verify: { status: 'idle' } })
  }

  setConstant(constantId: string): void {
    this.cancelPending()
    useLab.setState({ constantId })
    this.computeConstant()
  }

  setPrecision(precision: number): void {
    this.cancelPending()
    useLab.setState({ precision })
    this.computeConstant()
  }

  setExperiment(experimentId: string): void {
    this.cancelPending()
    const def = getExperiment(experimentId)
    useLab.setState({ experimentId, params: defaultParams(def.parameters) })
    this.initSimulation()
  }

  setParam(key: string, value: ParamValue): void {
    this.cancelPending()
    useLab.setState((s) => ({ params: { ...s.params, [key]: value } }))
    this.initSimulation()
  }

  setDigitStart(digitStart: DigitStart): void {
    this.cancelPending()
    useLab.setState({ digitStart })
    this.initSimulation()
  }

  currentConfig(): LabConfig {
    const s = useLab.getState()
    return {
      constant: s.constantId,
      precision: s.precision,
      experiment: s.experimentId,
      digitStart: s.digitStart,
      parameters: { ...s.params },
    }
  }

  /** Apply a full configuration, then optionally run to `steps` and verify a digest. */
  applyConfig(config: LabConfig, steps?: number, expectedDigest?: string): void {
    this.pendingVerify = null
    this.pending = { seek: steps && steps > 0 ? steps : null, verify: expectedDigest ?? null }
    useLab.setState({
      constantId: config.constant,
      precision: config.precision,
      experimentId: config.experiment,
      digitStart: config.digitStart,
      params: { ...config.parameters },
      verify: expectedDigest ? { status: 'running', expected: expectedDigest } : { status: 'idle' },
    })
    const loaded = this.loaded
    const computing = useLab.getState().phase === 'computing'
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
    const s = useLab.getState()
    if (s.phase !== 'ready' || s.finished) return
    this.leaveView()
    this.clearVerifiedBadge()
    this.postSim({ type: 'play', stepsPerSecond: SPEEDS[s.speedIndex]!.stepsPerSecond })
  }

  pause(): void {
    this.postSim({ type: 'pause' })
  }

  togglePlay(): void {
    if (useLab.getState().playing) this.pause()
    else this.play()
  }

  step(count = 1): void {
    if (useLab.getState().phase !== 'ready') return
    this.leaveView()
    this.clearVerifiedBadge()
    this.postSim({ type: 'step', count })
  }

  reset(): void {
    this.cancelPending()
    this.postSim({ type: 'reset' })
  }

  /** A finished verification describes the geometry at that moment; drop it once it moves on. */
  private clearVerifiedBadge(): void {
    const v = useLab.getState().verify
    if (v.status === 'verified' || v.status === 'mismatch') useLab.setState({ verify: { status: 'idle' } })
  }

  setSpeed(speedIndex: number): void {
    useLab.setState({ speedIndex })
    this.postSim({ type: 'setSpeed', stepsPerSecond: SPEEDS[speedIndex]!.stepsPerSecond })
  }

  /**
   * Timeline: show the structure as it was at `step`. Going back only hides later geometry
   * (nothing is recomputed); going beyond the computed head computes the missing steps.
   */
  seek(step: number, options: { inspect?: boolean } = {}): void {
    const s = useLab.getState()
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
    useLab.setState({ viewStep: view })
    this.renderer.setVisibleStep(view ?? Infinity)
    if (options.inspect === false) return
    if (target >= 1) this.queueInspect(target)
    else {
      useLab.setState({ inspected: null })
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
    if (useLab.getState().viewStep === null) return
    useLab.setState({ viewStep: null, inspected: null })
    this.renderer.setVisibleStep(Infinity)
  }

  // ---- inspection ------------------------------------------------------------------

  inspect(step: number): void {
    this.postSim({ type: 'inspect', requestId: ++this.inspectRequestId, step })
  }

  clearInspection(): void {
    const s = useLab.getState()
    if (s.viewStep !== null) {
      // keep showing the viewed step
      this.inspect(s.viewStep)
      return
    }
    useLab.setState({ inspected: null })
    this.renderer.setHighlight(s.currentTrace?.instructions ?? null)
  }

  // ---- view ---------------------------------------------------------------------------

  fitAll(): void {
    this.renderer.follow = true
    this.renderer.fitAll()
    useLab.setState({ follow: true })
  }

  center(): void {
    this.renderer.center()
  }

  setScientific(scientific: boolean): void {
    useLab.setState({ scientific })
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
    useLab.setState({
      verify: { status: 'error', message: `${what}: ${err instanceof Error ? err.message : String(err)}` },
    })
  }

  private async saveToHistoryUnsafe(): Promise<void> {
    const s = useLab.getState()
    const entry: HistoryEntry = {
      id: `${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`,
      timestamp: new Date().toISOString(),
      config: this.currentConfig(),
      steps: s.currentStep,
      digest: await geometryDigest(this.renderer.store, this.renderer.store.count),
    }
    useLab.setState({ history: addHistory(browserStorage(), entry) })
  }

  restoreHistory(id: string): void {
    const entry = useLab.getState().history.find((e) => e.id === id)
    if (entry) this.applyConfig(entry.config, entry.steps, entry.digest)
  }

  deleteHistory(id: string): void {
    useLab.setState({ history: removeHistory(browserStorage(), id) })
  }

  /** Build the reproducible JSON record of the current experiment (spec §28). */
  async buildExport(): Promise<ExperimentFile> {
    const s = useLab.getState()
    const def = getExperiment(s.experimentId)
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
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pi-infinite-lab_${file.config.experiment}_${file.config.constant}_${file.steps}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  importJson(text: string): void {
    try {
      const parsed = parseImport(text)
      this.applyConfig(parsed.config, parsed.steps, parsed.expectedDigest)
    } catch (err) {
      useLab.setState({
        verify: { status: 'error', message: err instanceof Error ? err.message : String(err) },
      })
    }
  }

  private async verifyIfPending(): Promise<void> {
    const expected = this.pendingVerify
    if (!expected) return
    this.pendingVerify = null
    const actual = await geometryDigest(this.renderer.store, this.renderer.store.count)
    useLab.setState({ verify: { status: actual === expected ? 'verified' : 'mismatch', expected, actual } })
  }

  // ---- worker plumbing ---------------------------------------------------------

  private postMath(msg: MathRequest): void {
    this.mathWorker.postMessage(msg)
  }

  private postSim(msg: SimRequest, transfer: Transferable[] = []): void {
    this.simWorker.postMessage(msg, transfer)
  }

  private initSimulation(): void {
    const s = useLab.getState()
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
        digitStart: s.digitStart,
        digits,
        integerPartLength: s.constant.integerPartLength,
        constant: { id: c.id, symbol: c.symbol },
      },
      [digits.buffer],
    )
  }

  private onMath(msg: MathResponse): void {
    if (msg.requestId !== this.mathRequestId) return // superseded
    if (msg.type === 'error') {
      useLab.setState({ phase: 'error', error: msg.message })
      return
    }
    const want = useLab.getState()
    if (msg.constantId !== want.constantId || msg.precision !== want.precision) {
      this.computeConstant() // selection changed without a new request: never show mismatched digits
      return
    }
    const c = CONSTANTS[msg.constantId]!
    this.digits = msg.digits
    this.loaded = { constantId: msg.constantId, precision: msg.precision }
    useLab.setState({
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
    this.renderer.clear()
    this.seekTarget = null
    useLab.setState({
      currentStep: 0,
      objects: 0,
      currentTrace: null,
      inspected: null,
      viewStep: null,
      finished: false,
      playing: false,
      follow: true,
      stepsPerSecond: 0,
    })
  }

  private onSim(msg: SimResponse): void {
    switch (msg.type) {
      case 'ready': {
        // Only the ready of the latest init counts (config changes may be queued behind it).
        if (msg.initId !== this.initId || useLab.getState().phase === 'computing') return
        this.resetView()
        useLab.setState({ phase: 'ready', totalSteps: msg.totalSteps })
        const pending = this.pending
        this.pending = null
        if (pending?.verify) this.pendingVerify = pending.verify
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
        const inspected = useLab.getState().inspected
        if (msg.trace && !inspected) this.renderer.setHighlight(msg.trace.instructions)
        useLab.setState({
          currentStep: msg.currentStep,
          totalSteps: msg.totalSteps,
          objects: this.renderer.objectCount,
          currentTrace: msg.trace ?? useLab.getState().currentTrace,
          finished: msg.finished,
          stepsPerSecond: msg.stepsPerSecond,
          lastBatchMs: msg.computeMs,
        })
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
        useLab.setState({ playing: msg.playing, finished: msg.finished, currentStep: msg.currentStep })
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
          useLab.setState({ inspected: msg.trace })
          this.renderer.setHighlight(msg.trace.instructions)
        }
        break
      case 'error':
        useLab.setState({ phase: 'error', error: msg.message, playing: false })
        break
    }
  }
}

let instance: LabController | undefined
export function getController(): LabController {
  instance ??= new LabController()
  return instance
}
