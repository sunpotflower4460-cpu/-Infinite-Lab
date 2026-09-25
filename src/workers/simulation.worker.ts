/// <reference lib="webworker" />
import { Simulation } from '../simulation/Simulation'
import type { SimRequest, SimResponse } from './protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope
const TICK_MS = 16
/** At most this many batches may be waiting for the renderer. */
const MAX_IN_FLIGHT = 2

let sim: Simulation | undefined
let playing = false
let timer: ReturnType<typeof setTimeout> | undefined
let lastTick = 0
let inFlight = 0
let generation = 0
let rateWindow: { t: number; steps: number }[] = []

function post(msg: SimResponse, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer)
}

function measuredRate(now: number, executed: number): number {
  rateWindow.push({ t: now, steps: executed })
  rateWindow = rateWindow.filter((r) => now - r.t < 1000)
  const total = rateWindow.reduce((a, r) => a + r.steps, 0)
  const span = Math.max(now - (rateWindow[0]?.t ?? now), 250)
  return (total * 1000) / span
}

function emit(steps: number, budgeted = false): void {
  if (!sim) return
  const r = sim.run(steps, budgeted)
  if (r.executed === 0 && !sim.runner.finished) return
  inFlight++
  post(
    {
      type: 'batch',
      generation,
      data: r.batch.data,
      count: r.batch.count,
      currentStep: sim.runner.currentStep,
      totalSteps: sim.runner.totalSteps,
      trace: r.trace,
      finished: sim.runner.finished,
      stepsPerSecond: measuredRate(performance.now(), r.executed),
      computeMs: r.computeMs,
    },
    [r.batch.data.buffer],
  )
}

function stop(): void {
  playing = false
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function tick(): void {
  timer = undefined
  if (!sim || !playing) return
  const now = performance.now()
  const dt = now - lastTick
  lastTick = now
  if (inFlight < MAX_IN_FLIGHT) {
    const due = sim.stepsDue(dt)
    if (due > 0) emit(due, !Number.isFinite(sim.stepsPerSecond))
  }
  if (sim.runner.finished) {
    stop()
    post({ type: 'status', playing: false, currentStep: sim.runner.currentStep, finished: true })
    return
  }
  timer = setTimeout(tick, TICK_MS)
}

ctx.onmessage = (e: MessageEvent<SimRequest>) => {
  const msg = e.data
  try {
    switch (msg.type) {
      case 'init':
        stop()
        inFlight = 0
        generation++
        rateWindow = []
        sim = new Simulation(msg)
        post({ type: 'ready', initId: msg.initId, totalSteps: sim.runner.totalSteps })
        break
      case 'play':
        if (!sim || sim.runner.finished) return
        sim.stepsPerSecond = msg.stepsPerSecond
        if (!playing) {
          playing = true
          lastTick = performance.now()
          post({ type: 'status', playing: true, currentStep: sim.runner.currentStep, finished: false })
          timer = setTimeout(tick, 0)
        }
        break
      case 'setSpeed':
        if (sim) sim.stepsPerSecond = msg.stepsPerSecond
        break
      case 'pause':
        stop()
        if (sim)
          post({
            type: 'status',
            playing: false,
            currentStep: sim.runner.currentStep,
            finished: sim.runner.finished,
          })
        break
      case 'step':
        if (!sim) return
        stop()
        emit(msg.count)
        post({
          type: 'status',
          playing: false,
          currentStep: sim.runner.currentStep,
          finished: sim.runner.finished,
        })
        break
      case 'seekTo': {
        if (!sim) return
        stop()
        // Uses the worker's own step counter: batches still in flight to the main thread
        // cannot make the target overshoot.
        const count = Math.max(0, Math.min(msg.step, sim.runner.totalSteps) - sim.runner.currentStep)
        if (count > 0) emit(count)
        post({
          type: 'status',
          playing: false,
          currentStep: sim.runner.currentStep,
          finished: sim.runner.finished,
        })
        break
      }
      case 'reset':
        stop()
        inFlight = 0
        generation++
        rateWindow = []
        sim?.reset()
        post({ type: 'reset', currentStep: 0 })
        break
      case 'inspect':
        if (!sim) return
        try {
          post({ type: 'inspect', requestId: msg.requestId, trace: sim.runner.inspect(msg.step) })
        } catch (err) {
          post({ type: 'inspect', requestId: msg.requestId, trace: null, error: String(err) })
        }
        break
      case 'ack':
        if (msg.generation === generation) inFlight = Math.max(0, inFlight - 1)
        break
    }
  } catch (err) {
    stop()
    post({ type: 'error', message: String(err) })
  }
}
