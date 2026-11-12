import { useEffect, useRef, useState, type RefObject } from 'react'
import { create } from 'zustand'
import { GOLDEN } from '../../rhythm/models'
import type { RhythmReply, RhythmRequest } from '../../workers/rhythm.worker'

export const C_PI = '#b89cff' // 1/π: purple, as in the report's figures
export const C_PHI = '#ffc766' // 1/φ: gold
export const C_FRAC = '#8a93ad'

/** The beats the textbook compares (s = beat period / own period). */
export const BEATS = [
  { id: 'invpi', label: '1/π', w: 1 / Math.PI, color: C_PI },
  { id: 'golden', label: '1/φ（黄金比）', w: GOLDEN, color: C_PHI },
  { id: 'third', label: '1/3', w: 1 / 3, color: C_FRAC },
  { id: 'half', label: '1/2', w: 1 / 2, color: C_FRAC },
  { id: 'inve', label: '1/e', w: 1 / Math.E, color: '#6fd3b8' },
  { id: 'invsqrt2', label: '1/√2', w: Math.SQRT1_2, color: '#7f9cff' },
] as const
export type BeatId = (typeof BEATS)[number]['id']
export const beatOf = (id: BeatId) => BEATS.find((b) => b.id === id)!

/** The beat chosen for one cell (section 4), shared with the tongue map (section 5). */
export const useCell = create<{ s: number; beat: BeatId | null; gamma: number }>(() => ({
  s: 1 / Math.PI,
  beat: 'invpi',
  gamma: 0.05,
}))

/** Viridis (polynomial fit), t in [0, 1] → [r, g, b] 0..255. */
export function viridis(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t))
  const c = (k: number[]) =>
    k[0]! + t * (k[1]! + t * (k[2]! + t * (k[3]! + t * (k[4]! + t * (k[5]! + t * k[6]!)))))
  return [
    255 * c([0.2777, 0.105, -0.3309, -4.6342, 6.2283, 4.7764, -5.4355]),
    255 * c([0.0054, 1.4046, 0.2148, -5.7991, 14.1799, -13.7451, 4.6459]),
    255 * c([0.334, 1.3846, 0.0951, -19.3324, 56.6906, -65.353, 26.3124]),
  ].map((x) => Math.round(Math.min(255, Math.max(0, x)))) as [number, number, number]
}

const LUT = Array.from({ length: 256 }, (_, i) => viridis(i / 255))
/** u of FitzHugh–Nagumo (about −2.1 … 2.1) → colour: yellow where it is excited. */
export function uColor(u: number): [number, number, number] {
  return LUT[Math.max(0, Math.min(255, Math.round(((u + 2.1) / 4.2) * 255)))]!
}

/** True while the element is (nearly) on screen: the live parts run only then. */
export function useVisible(ref: RefObject<Element | null>, margin = '200px'): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setOn(true)
      return
    }
    const io = new IntersectionObserver(([e]) => setOn(!!e?.isIntersecting), { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, margin])
  return on
}

/** A worker of its own for one section, ended when the section goes away. */
export function useRhythmWorker(onReply: (r: RhythmReply) => void) {
  const worker = useRef<Worker | null>(null)
  const handler = useRef(onReply)
  handler.current = onReply
  useEffect(
    () => () => {
      worker.current?.terminate()
      worker.current = null
    },
    [],
  )
  return {
    send(m: RhythmRequest) {
      if (!worker.current) {
        worker.current = new Worker(new URL('../../workers/rhythm.worker.ts', import.meta.url), {
          type: 'module',
        })
        worker.current.onmessage = (e: MessageEvent<RhythmReply>) => handler.current(e.data)
      }
      worker.current.postMessage(m)
    },
    stop() {
      worker.current?.terminate()
      worker.current = null
    },
  }
}

/** requestAnimationFrame loop while `on`; the callback gets seconds since the last frame. */
export function useFrames(on: boolean, cb: (dt: number) => void) {
  const fn = useRef(cb)
  fn.current = cb
  useEffect(() => {
    if (!on) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      fn.current(Math.min(0.1, (now - last) / 1000))
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [on])
}

/** Canvas sized to its CSS box × device pixels; returns the 2D context in CSS pixels. */
export function fitCanvas(el: HTMLCanvasElement, aspect = 1): CanvasRenderingContext2D | null {
  const ctx = el.getContext('2d')
  if (!ctx) return null
  const w = el.clientWidth || 320
  const h = Math.round(w * aspect)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
    el.width = Math.round(w * dpr)
    el.height = Math.round(h * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

export const fmt = (x: number, d = 3) => x.toFixed(d)
export const pct = (x: number) => `${Math.round(x * 1000) / 10}%`

/** Button row to pick one option. */
export function Pick<T extends string | number>({
  value,
  options,
  onPick,
  label,
}: {
  value: T | null
  options: { value: T; label: string; color?: string }[]
  onPick: (v: T) => void
  label: string
}) {
  return (
    <div className="room-buttons" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          className={value === o.value ? 'active' : ''}
          aria-pressed={value === o.value}
          onClick={() => onPick(o.value)}
          style={o.color && value === o.value ? { borderColor: o.color, color: o.color } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
