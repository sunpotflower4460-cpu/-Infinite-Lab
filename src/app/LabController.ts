import { CONSTANTS } from '../math/constants'
import { getExperiment } from '../experiments/registry'
import { defaultParams, type DigitStart, type ParamValue } from '../experiments/core/types'
import { PixiRenderer } from '../renderer/PixiRenderer'
import { SPEEDS, useLab } from '../state/labStore'
import type { MathRequest, MathResponse, SimRequest, SimResponse } from '../workers/protocol'

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
  private statsTimer: ReturnType<typeof setInterval> | undefined
  private mounted = false

  constructor() {
    this.mathWorker = new Worker(new URL('../workers/math.worker.ts', import.meta.url), { type: 'module' })
    this.simWorker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.mathWorker.onmessage = (e: MessageEvent<MathResponse>) => this.onMath(e.data)
    this.simWorker.onmessage = (e: MessageEvent<SimResponse>) => this.onSim(e.data)
    this.renderer.onUserCamera = () => useLab.setState({ follow: false })
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

  // ---- commands --------------------------------------------------------------

  computeConstant(): void {
    const { constantId, precision } = useLab.getState()
    const requestId = ++this.mathRequestId
    this.pause()
    useLab.setState({ phase: 'computing', error: null })
    this.postMath({ type: 'compute', requestId, constantId, precision })
  }

  setPrecision(precision: number): void {
    useLab.setState({ precision })
    this.computeConstant()
  }

  setExperiment(experimentId: string): void {
    const def = getExperiment(experimentId)
    useLab.setState({ experimentId, params: defaultParams(def.parameters) })
    this.initSimulation()
  }

  setParam(key: string, value: ParamValue): void {
    useLab.setState((s) => ({ params: { ...s.params, [key]: value } }))
    this.initSimulation()
  }

  setDigitStart(digitStart: DigitStart): void {
    useLab.setState({ digitStart })
    this.initSimulation()
  }

  play(): void {
    const s = useLab.getState()
    if (s.phase !== 'ready' || s.finished) return
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
    this.postSim({ type: 'step', count })
  }

  reset(): void {
    this.postSim({ type: 'reset' })
  }

  setSpeed(speedIndex: number): void {
    useLab.setState({ speedIndex })
    this.postSim({ type: 'setSpeed', stepsPerSecond: SPEEDS[speedIndex]!.stepsPerSecond })
  }

  inspect(step: number): void {
    this.postSim({ type: 'inspect', requestId: ++this.inspectRequestId, step })
  }

  clearInspection(): void {
    useLab.setState({ inspected: null })
    this.renderer.setHighlight(useLab.getState().currentTrace?.instructions ?? null)
  }

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

  // ---- worker plumbing ---------------------------------------------------------

  private postMath(msg: MathRequest): void {
    this.mathWorker.postMessage(msg)
  }

  private postSim(msg: SimRequest, transfer: Transferable[] = []): void {
    this.simWorker.postMessage(msg, transfer)
  }

  private initSimulation(): void {
    const s = useLab.getState()
    if (!this.digits || !s.constant) return
    const c = CONSTANTS[s.constantId]!
    // Copy: the main thread keeps its digits for display; the worker owns its own buffer.
    const digits = this.digits.slice()
    this.postSim(
      {
        type: 'init',
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
    const c = CONSTANTS[msg.constantId]!
    this.digits = msg.digits
    useLab.setState({
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
    useLab.setState({
      currentStep: 0,
      objects: 0,
      currentTrace: null,
      inspected: null,
      finished: false,
      playing: false,
      follow: true,
      stepsPerSecond: 0,
    })
  }

  private onSim(msg: SimResponse): void {
    switch (msg.type) {
      case 'ready':
        this.resetView()
        useLab.setState({ phase: 'ready', totalSteps: msg.totalSteps })
        break
      case 'reset':
        this.resetView()
        break
      case 'batch': {
        this.renderer.append({ data: msg.data, count: msg.count })
        this.postSim({ type: 'ack' })
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
        break
      }
      case 'status':
        useLab.setState({ playing: msg.playing, finished: msg.finished, currentStep: msg.currentStep })
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
